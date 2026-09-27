# Hướng dẫn kiểm tra dữ liệu D3

## Mục đích

Đọc source thật và ghi lại những gì source chứng minh, trước khi xem dự đoán
của ArchSync hoặc công cụ đối chiếu. Không lấy kết quả tool làm đáp án chuẩn.

HyperDX và Etherpad có snapshot cùng hai bộ ledger trống riêng. Reactive Resume
đã được thu thập bổ sung bằng định dạng Git object, giữ nguyên symlink; lỗi của
lần thu thập đầu vẫn được lưu. Định dạng bổ sung này cần technical review trước
khi dùng làm đầu vào đã chốt. Danh sách và hash ở
`D3-COLLECTION-RECEIPT-20260927.md`.

Đây là bộ chuẩn bị, chưa phải lệnh bắt đầu gán nhãn chính thức. Cần chốt phạm
vi, rubric, role/exposure và protocol trước; không ghi ngày chấp nhận lùi về
trước hoặc coi bản chuẩn bị là bằng chứng đã được người khác duyệt.

## Việc người gán nhãn cần xác nhận thật

- Tên người thực hiện; đã phát triển hoặc điều chỉnh phần analyzer nào, kể cả
  thông qua AI/tài khoản được ủy quyền.
- Đã từng dùng source này để sửa tool, viết test hay prompt chưa; đã xem dự
  đoán nào của ArchSync hoặc baseline trên source này chưa.
- Phạm vi và phiên bản rubric đã đọc, đồng ý áp dụng.

Các mục này hiện chưa được điền. Không được đánh dấu độc lập chỉ vì người làm
dùng một tài khoản khác hoặc chạy ở một cuộc trò chuyện AI khác.

## Đọc và ghi kết quả

1. Mỗi người giữ một bản riêng của `reviewer-a-file-ledger.csv` hoặc
   `reviewer-b-file-ledger.csv` cùng file `*-observations.csv`. Hai người không
   xem quyết định của nhau trong lượt đầu. Chỉ cột định danh source được điền
   sẵn; thông tin người đọc và quyết định đều để trống.
2. Kiểm tra toàn bộ danh sách file trong phạm vi đã chốt. Ledger hiện chứa cả
   file được đề xuất loại là test/declaration để việc loại không bị ẩn. Xác
   nhận hoặc nêu vấn đề với tiêu chí trước khi bắt đầu nhãn chính thức.
3. Với mỗi observation, ghi repository/commit, file/dòng, loại đơn vị, nguồn,
   đích, loại quan hệ và lý do từ source. Nếu không thể xác định do wrapper,
   cấu hình hoặc runtime, ghi Unknown và giải thích, không đoán.
4. Phân biệt quan hệ service với import giữa module. Một import trong cùng
   service không tự trở thành HTTP/database edge. Không so dependency-cruiser
   trên những quan hệ mà nó không hỗ trợ.
5. Không gọi một quan hệ là violation nếu chưa có quy tắc kiến trúc được chấp
   nhận trước phép đo. Không dựng mô hình expected từ dự đoán observed rồi đo
   chúng giống nhau. Muốn đánh giá drift phải có cặp commit thật và ý định
   kiến trúc/rule tương ứng; một snapshot không tự chứng minh thay đổi.
6. Giữ quyết định ban đầu, trường hợp không rõ và file không có quan hệ; không
   chỉ ghi các vị trí tool có thể tìm thấy. Sau hai lượt riêng, đối chiếu và
   ghi cách giải quyết khác biệt mà không ghi đè nhãn ban đầu.

AI có thể giúp tìm vị trí, giải thích source và chuẩn hóa bản ghi nếu được
phép trong protocol, nhưng người thực hiện phải kiểm tra và nhận trách nhiệm
về nhãn thật. Không dùng AI làm hai reviewer độc lập, ký thay, hoặc tạo xác
nhận cá nhân. Ghi rõ mức hỗ trợ AI đã dùng.

CSV trong packet là bản ghi chuẩn bị để con người đọc và kiểm tra. Nó không
tự thay thế JSONL/manifest theo protocol và không tự vượt qua freeze gate.

## Kết quả bàn giao

- Khai báo vai trò/tiếp xúc dữ liệu thật của mỗi người.
- Ledger kiểm tra file hoàn chỉnh và các observation có evidence.
- Nhãn gốc riêng của hai lượt, kết quả đối chiếu và các Unknown còn lại.
- Xác nhận source, rubric và quy tắc kiến trúc dùng để gán nhãn.

Chưa gửi nhãn vào nơi dùng để phát triển hoặc chỉnh analyzer. Điều phối viên
kiểm tra tính đầy đủ, chốt nhãn cùng các phiên bản input/tool, rồi mới chạy
đánh giá và tính TP/FP/FN. Không điền con số để đạt một tỷ lệ mong muốn.

## Tin nhắn có thể gửi Hoàng

Hoàng kiểm tra giúp bộ chuẩn bị D3: ba repo HyperDX, Reactive Resume và Etherpad
đã có source cố định theo commit và hash; chưa chạy ArchSync/baseline trên đó.
Trước khi gán nhãn, Hoàng ghi đúng phần Core/Guardian đã từng phát triển hoặc
điều chỉnh (kể cả qua AI), và đã xem dự đoán trên ba repo này chưa. Nhóm cần
chốt thêm người gán nhãn thứ hai, phạm vi và rubric; hai người giữ quyết định
riêng trong lượt đầu. Đừng xác nhận độc lập nếu không đúng thực tế. Mình đã
chuẩn bị ledger và hướng dẫn, nhưng không điền nhãn hay xác nhận thay Hoàng.
