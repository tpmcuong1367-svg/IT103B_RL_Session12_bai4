/*
 * ============================================================
 * RIKKEISTREAM - SAAS SUBSCRIPTION MANAGER CLI
 * ============================================================
 *
 * 1. SƠ ĐỒ LUỒNG DỮ LIỆU (DFD - MERMAID)
 *
 * flowchart TD
 *     CSKH["Nhân viên CSKH (Tác nhân ngoài)"]
 *     DS[("Kho dữ liệu: subscriptions[] và PLANS[]")]
 *
 *     CSKH -->|"menuChoice 0-6"| P0["P0. Menu điều hướng (do-while + switch)"]
 *
 *     P0 -->|"1"| P1["P1. addSubscription"]
 *     P0 -->|"2"| P2["P2. searchSubscription"]
 *     P0 -->|"3"| P3["P3. changePlan"]
 *     P0 -->|"4"| P4["P4. lockOverdueSubscription"]
 *     P0 -->|"5"| P5["P5. calculateMRR"]
 *     P0 -->|"6"| P6["P6. listSubscriptions"]
 *     P0 -->|"0"| END(["Thoát chương trình"])
 *
 *     CSKH -->|"Tên, mã gói"| P1
 *     CSKH -->|"Mã TK hoặc tên"| P2
 *     CSKH -->|"Mã TK, mã gói mới"| P3
 *     CSKH -->|"Mã TK"| P4
 *
 *     P1 <-->|"Kiểm tra mã gói, thêm bản ghi"| DS
 *     P2 -->|"Đọc bản ghi"| DS
 *     P3 <-->|"Đọc, cập nhật gói và đơn giá"| DS
 *     P4 <-->|"Đọc nợ cước, cập nhật trạng thái"| DS
 *     P5 -->|"Đọc các thuê bao còn hiệu lực"| DS
 *     P6 -->|"Đọc toàn bộ"| DS
 *
 *     P1 -->|"Thông báo kết quả / lỗi"| CSKH
 *     P2 -->|"Bảng kết quả / không tìm thấy"| CSKH
 *     P3 -->|"Thông báo kết quả / lỗi"| CSKH
 *     P4 -->|"Thông báo kết quả / lỗi"| CSKH
 *     P5 -->|"Báo cáo MRR"| CSKH
 *     P6 -->|"Bảng danh sách"| CSKH
 *
 * 2. CẤU TRÚC DỮ LIỆU THUÊ BAO (Array of Objects)
 *    { subscriptionId, customerName, planCode, price, daysOverdue, status }
 *    status: ACTIVE (0 ngày nợ) | GRACE_PERIOD (1-3 ngày nợ) | LOCKED (đã khóa)
 *
 * 3. QUY TẮC NGHIỆP VỤ
 *    - Nợ cước 1-3 ngày: GRACE_PERIOD, vẫn được dùng dịch vụ.
 *    - Nợ cước > 3 ngày: đủ điều kiện khóa (LOCKED).
 *    - MRR = tổng đơn giá của thuê bao chưa bị khóa (ACTIVE + GRACE_PERIOD).
 *
 * 4. CÁC EDGE CASES ĐÃ XỬ LÝ
 *    EC1. Nhập sai mã gói (không có trong PLANS) -> báo lỗi, không thêm/đổi.
 *    EC2. Nợ cước quá hạn: chỉ khóa khi daysOverdue > 3; chưa quá hạn thì từ chối;
 *         đã khóa rồi thì báo; thuê bao bị khóa không được đổi gói.
 *    EC3. Tìm kiếm không ra kết quả -> thông báo rõ ràng.
 *    EC4. Bổ sung: tên trống, đổi sang đúng gói đang dùng, lựa chọn menu sai.
 */

const fs = require('fs');

// ============================================================
// DỮ LIỆU
// ============================================================
const OVERDUE_LIMIT = 3; // quá số ngày này thì được khóa

const PLANS = [
  { code: 'FREE', price: 0, deviceLimit: 1 },
  { code: 'BASIC', price: 99000, deviceLimit: 2 },
  { code: 'PREMIUM', price: 199000, deviceLimit: 4 },
  { code: 'FAMILY', price: 299000, deviceLimit: 6 }
];

const subscriptions = [
  { subscriptionId: 'SUB_001', customerName: 'Nguyen Van An', planCode: 'FAMILY', price: 299000, daysOverdue: 0, status: 'ACTIVE' },
  { subscriptionId: 'SUB_002', customerName: 'Tran Thi Mai', planCode: 'PREMIUM', price: 199000, daysOverdue: 2, status: 'GRACE_PERIOD' },
  { subscriptionId: 'SUB_003', customerName: 'Le Quoc Bao', planCode: 'BASIC', price: 99000, daysOverdue: 5, status: 'GRACE_PERIOD' },
  { subscriptionId: 'SUB_004', customerName: 'Pham Thu Ha', planCode: 'PREMIUM', price: 199000, daysOverdue: 0, status: 'ACTIVE' },
  { subscriptionId: 'SUB_005', customerName: 'Vo Minh Tuan', planCode: 'FREE', price: 0, daysOverdue: 0, status: 'ACTIVE' }
];
let nextId = 6;

// ============================================================
// NHẬP LIỆU
// ============================================================
function readLine(message) {
  process.stdout.write(message);
  let line = '';
  const buffer = Buffer.alloc(1);
  while (true) {
    let bytes = 0;
    try {
      bytes = fs.readSync(0, buffer, 0, 1, null);
    } catch (e) {
      bytes = 0;
    }
    if (bytes === 0) return line === '' ? null : line.trim(); // hết dữ liệu nhập
    const ch = buffer.toString();
    if (ch === '\n') return line.trim();
    if (ch !== '\r') line += ch;
  }
}

// ============================================================
// HÀM TIỆN ÍCH (đơn nhiệm, không in/nhập gì)
// ============================================================
function formatMoney(amount) {
  let s = String(amount);
  let result = '';
  let count = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    result = s[i] + result;
    count++;
    if (count % 3 === 0 && i > 0) result = '.' + result;
  }
  return result + ' đ';
}

function generateId() {
  let num = String(nextId);
  while (num.length < 3) num = '0' + num;
  nextId++;
  return 'SUB_' + num;
}

function findPlan(code) {
  const upper = code.toUpperCase();
  for (let i = 0; i < PLANS.length; i++) {
    if (PLANS[i].code === upper) return PLANS[i];
  }
  return null;
}

function findIndexById(id) {
  for (let i = 0; i < subscriptions.length; i++) {
    if (subscriptions[i].subscriptionId === id.toUpperCase()) return i;
  }
  return -1;
}

function findIndexesByName(keyword) {
  const result = [];
  const key = keyword.toLowerCase();
  for (let i = 0; i < subscriptions.length; i++) {
    if (subscriptions[i].customerName.toLowerCase().indexOf(key) !== -1) result.push(i);
  }
  return result;
}

// ============================================================
// HIỂN THỊ
// ============================================================
function showMenu() {
  console.log('\n=========== RIKKEISTREAM - QUẢN TRỊ THUÊ BAO ===========');
  console.log('1. Thêm khách hàng mới');
  console.log('2. Tra cứu thuê bao');
  console.log('3. Nâng/Hạ cấp gói');
  console.log('4. Khóa thuê bao nợ cước');
  console.log('5. Thống kê doanh thu định kỳ (MRR)');
  console.log('6. Xem toàn bộ danh sách');
  console.log('0. Thoát');
  console.log('========================================================');
}

function showPlans() {
  console.log('Các gói cước hiện có:');
  for (let i = 0; i < PLANS.length; i++) {
    console.log('  - ' + PLANS[i].code.padEnd(8) + formatMoney(PLANS[i].price).padEnd(12) + PLANS[i].deviceLimit + ' thiết bị');
  }
}

function printTable(indexes) {
  const line = '+' + '-'.repeat(10) + '+' + '-'.repeat(20) + '+' + '-'.repeat(10) + '+' + '-'.repeat(14) + '+' + '-'.repeat(10) + '+' + '-'.repeat(14) + '+';
  console.log(line);
  console.log('| ' + 'Mã TK'.padEnd(8) + ' | ' + 'Khách hàng'.padEnd(18) + ' | ' + 'Gói'.padEnd(8) + ' | ' + 'Đơn giá'.padEnd(12) + ' | ' + 'Ngày nợ'.padEnd(8) + ' | ' + 'Trạng thái'.padEnd(12) + ' |');
  console.log(line);
  for (let i = 0; i < indexes.length; i++) {
    const s = subscriptions[indexes[i]];
    console.log('| ' + s.subscriptionId.padEnd(8) + ' | ' + s.customerName.padEnd(18) + ' | ' + s.planCode.padEnd(8) + ' | ' + formatMoney(s.price).padEnd(12) + ' | ' + String(s.daysOverdue).padEnd(8) + ' | ' + s.status.padEnd(12) + ' |');
  }
  console.log(line);
}

// ============================================================
// CÁC CHỨC NĂNG (CRUD + NGHIỆP VỤ)
// ============================================================
function addSubscription() {
  console.log('\n--- THÊM KHÁCH HÀNG MỚI ---');
  const name = readLine('Nhập tên khách hàng: ');
  if (name === null || name === '') {
    console.log('Lỗi: Tên khách hàng không được để trống.'); // EC4
    return;
  }
  showPlans();
  const planCode = readLine('Nhập mã gói: ');
  const plan = planCode === null ? null : findPlan(planCode);
  if (plan === null) {
    console.log('Lỗi: Mã gói không hợp lệ.'); // EC1
    return;
  }
  const sub = {
    subscriptionId: generateId(),
    customerName: name,
    planCode: plan.code,
    price: plan.price,
    daysOverdue: 0,
    status: 'ACTIVE'
  };
  subscriptions.push(sub);
  console.log('Đã thêm thuê bao ' + sub.subscriptionId + ' (' + name + ', gói ' + plan.code + ').');
}

function searchSubscription() {
  console.log('\n--- TRA CỨU THUÊ BAO ---');
  const keyword = readLine('Nhập mã tài khoản hoặc tên khách hàng: ');
  if (keyword === null || keyword === '') {
    console.log('Lỗi: Từ khóa không được để trống.');
    return;
  }
  let indexes = [];
  const idIndex = findIndexById(keyword);
  if (idIndex !== -1) {
    indexes.push(idIndex);
  } else {
    indexes = findIndexesByName(keyword);
  }
  if (indexes.length === 0) {
    console.log('Không tìm thấy thuê bao nào khớp với "' + keyword + '".'); // EC3
    return;
  }
  printTable(indexes);
}

function listSubscriptions() {
  console.log('\n--- DANH SÁCH THUÊ BAO ---');
  if (subscriptions.length === 0) {
    console.log('Danh sách trống.');
    return;
  }
  const indexes = [];
  for (let i = 0; i < subscriptions.length; i++) indexes.push(i);
  printTable(indexes);
  console.log('Tổng: ' + subscriptions.length + ' thuê bao.');
}

function changePlan() {
  console.log('\n--- NÂNG/HẠ CẤP GÓI ---');
  const id = readLine('Nhập mã tài khoản: ');
  if (id === null || id === '') {
    console.log('Lỗi: Mã tài khoản không được để trống.');
    return;
  }
  const index = findIndexById(id);
  if (index === -1) {
    console.log('Không tìm thấy thuê bao có mã ' + id + '.'); // EC3
    return;
  }
  const sub = subscriptions[index];
  if (sub.status === 'LOCKED') {
    console.log('Thuê bao đang bị khóa do nợ cước, không thể đổi gói.'); // EC2
    return;
  }
  console.log('Gói hiện tại của ' + sub.customerName + ': ' + sub.planCode + ' (' + formatMoney(sub.price) + ')');
  showPlans();
  const planCode = readLine('Nhập mã gói mới: ');
  const plan = planCode === null ? null : findPlan(planCode);
  if (plan === null) {
    console.log('Lỗi: Mã gói không hợp lệ.'); // EC1
    return;
  }
  if (plan.code === sub.planCode) {
    console.log('Thuê bao đã ở gói ' + plan.code + ', không có thay đổi.'); // EC4
    return;
  }
  const action = plan.price > sub.price ? 'Nâng cấp' : 'Hạ cấp';
  sub.planCode = plan.code;
  sub.price = plan.price;
  console.log(action + ' ' + sub.subscriptionId + ' sang gói ' + plan.code + ' (' + formatMoney(plan.price) + ').');
}

function lockOverdueSubscription() {
  console.log('\n--- KHÓA THUÊ BAO NỢ CƯỚC ---');
  const id = readLine('Nhập mã tài khoản: ');
  if (id === null || id === '') {
    console.log('Lỗi: Mã tài khoản không được để trống.');
    return;
  }
  const index = findIndexById(id);
  if (index === -1) {
    console.log('Không tìm thấy thuê bao có mã ' + id + '.'); // EC3
    return;
  }
  const sub = subscriptions[index];
  if (sub.status === 'LOCKED') {
    console.log('Thuê bao ' + sub.subscriptionId + ' đã bị khóa trước đó.');
    return;
  }
  if (sub.daysOverdue <= OVERDUE_LIMIT) {
    console.log('Chưa đủ điều kiện khóa: nợ ' + sub.daysOverdue + ' ngày (chỉ khóa khi nợ quá ' + OVERDUE_LIMIT + ' ngày).'); // EC2
    return;
  }
  sub.status = 'LOCKED';
  console.log('Đã khóa thuê bao ' + sub.subscriptionId + ' (nợ ' + sub.daysOverdue + ' ngày).');
}

function calculateMRR() {
  console.log('\n--- THỐNG KÊ DOANH THU ĐỊNH KỲ (MRR) ---');
  let total = 0;
  let countActive = 0;
  let countLocked = 0;
  for (let i = 0; i < subscriptions.length; i++) {
    if (subscriptions[i].status === 'LOCKED') {
      countLocked++;
    } else {
      total += subscriptions[i].price;
      countActive++;
    }
  }
  console.log('Thuê bao đang tính phí : ' + countActive);
  console.log('Thuê bao đã khóa       : ' + countLocked + ' (không tính vào MRR)');
  console.log('Doanh thu theo gói:');
  for (let p = 0; p < PLANS.length; p++) {
    let planTotal = 0;
    let planCount = 0;
    for (let i = 0; i < subscriptions.length; i++) {
      if (subscriptions[i].status !== 'LOCKED' && subscriptions[i].planCode === PLANS[p].code) {
        planTotal += subscriptions[i].price;
        planCount++;
      }
    }
    console.log('  - ' + PLANS[p].code.padEnd(8) + planCount + ' TK'.padEnd(6) + formatMoney(planTotal));
  }
  console.log('TỔNG MRR: ' + formatMoney(total));
}

// ============================================================
// CHƯƠNG TRÌNH CHÍNH
// ============================================================
function main() {
  let menuChoice;
  do {
    showMenu();
    menuChoice = readLine('Nhập lựa chọn (0-6): ');
    if (menuChoice === null) menuChoice = '0';

    switch (menuChoice) {
      case '1': addSubscription(); break;
      case '2': searchSubscription(); break;
      case '3': changePlan(); break;
      case '4': lockOverdueSubscription(); break;
      case '5': calculateMRR(); break;
      case '6': listSubscriptions(); break;
      case '0': console.log('Đã thoát chương trình. Tạm biệt!'); break;
      default: console.log('Lựa chọn không hợp lệ, vui lòng nhập từ 0 đến 6.'); // EC4
    }
  } while (menuChoice !== '0');
}

main();
