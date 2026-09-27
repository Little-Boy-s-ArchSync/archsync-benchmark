# D3: đề xuất contract nghiên cứu từ source

Lưu ý lịch sử: câu dưới đây về hai tác giả “blinded-to-tool-output” không còn áp dụng sau khai báo tiếp xúc mới. Theo `../../D3-AUTHOR-ANNOTATION-AMENDMENT.md`, AI được phép đọc source và đề xuất nhãn cho workflow thăm dò không blind. Quyết định ngày 28/09/2026 chấp nhận có điều kiện bốn module rule, giữ hai rule Reactive Resume ngoài phạm vi làm ngữ cảnh; xem `../../D3-RULE-DECISION-20260928.md`. Toàn bộ gói gốc vẫn là một đề xuất lịch sử, không phải runtime truth đã được chốt.

Phiên bản gói gốc: 0.1.0. Trạng thái của gói gốc: đề xuất. Bốn rule đã được chấp nhận **có điều kiện**, nhưng historical applicability, method và capability-matched tool run chưa được khóa; chưa được dùng để công bố nhãn hoặc kết quả.

## Contract này dùng để làm gì?

Contract là quy tắc mà nghiên cứu dùng để xác định một quan hệ kiến trúc có bị cấm hay không. Source cho biết code làm gì; source không tự chứng minh code đó đúng với ý định kiến trúc. Vì thế, tài liệu này tách:

- Quan sát: thông tin đọc được từ source/tài liệu tại commit được giữ lại.
- Quy tắc đề xuất: điều nhóm muốn kiểm tra, có lý do và phạm vi rõ ràng.
- Chấp nhận: quyết định thật của Hiếu/Hoàng sau khi đọc đề xuất. Hiện chưa có.

Không gọi các quy tắc dưới đây là contract được maintainer upstream phê duyệt. Reactive Resume có ADR hỗ trợ hướng của quy tắc, nhưng bản chuyển thể phục vụ nghiên cứu vẫn là của nhóm.

## Sáu quy tắc đề xuất

| Repo / ID | Quy tắc bằng ngôn ngữ dễ hiểu | Căn cứ và giới hạn |
| --- | --- | --- |
| HyperDX / D3-HDX-MOD-001 | Module model/lưu trữ không import ngược module xử lý HTTP route. | Route hiện dùng model; đây là đề xuất phân tách trách nhiệm của nghiên cứu, không phải lệnh cấm đã tìm thấy trong chính sách upstream. |
| Reactive Resume / D3-RR-MOD-001 | Server không import trực tiếp source riêng của web app. | ADR và tài liệu MCP nêu ranh giới này. Phục vụ web đã build không phải lỗi này. |
| Reactive Resume / D3-RR-MOD-002 | Package API không import source của app server. | Theo hướng package không phụ thuộc app trong ADR. Đây là quy tắc ngữ cảnh: scope thay đổi hiện chỉ chứa server, nên chưa mặc nhiên đủ coverage để đánh giá nó. |
| Reactive Resume / D3-RR-MOD-003 | Package API không import source riêng của app web. | Tương tự; không coi toàn bộ web app là browser-only vì đây là ứng dụng full-stack. |
| Etherpad / D3-EP-MOD-001 | Riêng adapter khởi tạo DB không import module xử lý message/request. | Đề xuất giữ tầng khởi tạo storage độc lập; không áp cho cả thư mục db hoặc cho plugin. |
| Etherpad / D3-EP-MOD-002 | Riêng adapter khởi tạo DB không import module/hook HTTP Express. | Server được phép khởi tạo cả DB và HTTP; chỉ hướng DB adapter phụ thuộc HTTP bị đề xuất cấm. |

Tất cả quy tắc mới là mức `warning` trong policy đề xuất. Nhãn nghiên cứu `violation` là vi phạm contract của nghiên cứu, không tự động có nghĩa bug, lỗ hổng hay quyết định BLOCK của upstream. Mapping chính xác và lý do từng rule nằm trong `proposal.json`.

## Hai loại quan hệ không được trộn

Các rule trên kiểm tra phụ thuộc trực tiếp giữa module nguồn. Chúng không phải quy tắc HTTP, database hay queue ở runtime. Đây là một phạm vi hẹp phù hợp để đề xuất so sánh module với dependency-cruiser; chưa có bằng chứng hai công cụ đã thực thi được cùng semantics.

Ngữ cảnh runtime đọc từ source/tài liệu:

- HyperDX: API, MongoDB, ClickHouse và các webhook cấu hình được. Không ép repo phải có PostgreSQL/Redis/AMQP để khớp detector của ArchSync.
- Reactive Resume: source chia app/package nhưng tài liệu mô tả một Node process; PostgreSQL qua package DB, storage có thể filesystem hoặc S3-compatible. Package API không phải một microservice riêng.
- Etherpad: HTTP/Socket.IO, adapter ueberdb chọn backend theo cấu hình và plugin hooks. Không đoán backend là PostgreSQL hay cấm mọi plugin dùng DB.

Mongoose, ClickHouse wrapper, Drizzle và ueberdb không được tự coi là đã được analyzer hỗ trợ đầy đủ. Không sửa analyzer dựa trên các ca D3 rồi báo lại như một holdout chưa từng được dùng. Nếu cần mở rộng, giữ kết quả trước sửa và phân biệt nghiên cứu hậu kiểm.

## Phạm vi và cách tránh số liệu tự tạo

1. Giữ nguyên toàn bộ 60 candidate hiện có, 20 mỗi repo, trong sổ disposition. Quyết định phạm vi ngày 28/09/2026 chọn 56 case chính và giữ bốn case chỉ đổi test làm ngữ cảnh; xem `../../D3-SCOPE-ACCEPTANCE-20260928.md`. Không lựa lại commit để tạo đủ nhãn vi phạm hoặc điểm đẹp. Các commit có thể chồng lấn file/lịch sử; đây không phải 60 quan sát độc lập.
2. Không tự kết luận `no-impact` chỉ vì không match sáu rule. Phải đọc thay đổi trong phạm vi đã chốt. Chưa có ground truth trong gói này.
3. Rule xét direct value dependency; type-only và test-only được tách ra. Import động không giải được, alias không rõ, source ngoài phạm vi hoặc backend cấu hình thiếu phải ghi Unknown/cần ngữ cảnh, không tự tính đúng.
4. Tệp `*.policy.architecture.json` là policy fragment đúng schema Core, **không phải expected graph hoàn chỉnh**. `relationships: []` không có nghĩa hệ thống không có quan hệ. Không đưa fragment này vào graph-diff để biến mọi cạnh thành evolution.
5. Phải chốt thêm phạm vi common-capability, cách dựng graph base/head và expected model cho từng ca trước khi chấm evolution hoặc công bố accuracy. Nếu D3 chỉ kiểm chứng module conformance, paper phải nói đúng phạm vi hẹp đó, không dùng kết quả để chứng minh detector runtime.
6. Không lấy số lượng trích dẫn, hash đúng, validator pass hoặc schema pass làm accuracy của ArchSync. Không có số precision/recall/F1 được sinh ở bước này.

## Không áp ngược tài liệu mới cho lịch sử cũ

Ba reference snapshot có commit đầy đủ trong `proposal.json`. Mỗi ca D3 lại có base/head riêng. `historical-context.json` chỉ kiểm tra file làm căn cứ ở hai phía có cùng bytes với reference không.

Trước gán nhãn, Hiếu/Hoàng phải chốt applicability theo ca/rule, có căn cứ: `applicable`, `not-applicable` hoặc `unresolved`. Nếu ADR hoặc role/mapping khác trong lịch sử, đọc bản lịch sử và ghi quyết định phạm vi. Không thay quy tắc giữa base và head để tự tạo vi phạm. Không nói một ADR ở snapshot mới đã là ý định của upstream tại mọi commit trước đó.

Quy tắc chủ động do nghiên cứu đặt ra vẫn có thể dùng cho một retrospective study nếu được chốt trước nhãn/prediction và mô tả rõ là study-defined. Nó không biến thành ground truth về lỗi mà maintainer đã xác nhận.

## Kiểm chứng và tái tạo gói

Chạy từ repository benchmark bằng Node 22.16.0. Ba tham số sau mode đều là đường dẫn tuyệt đối. `build` chỉ ghi vào thư mục mới; `check` không sửa gói.

```powershell
node scripts/d3-review/contracts.mjs build "<packet-goc>" "<review-kit>\cases.json" "<thu-muc-contract-moi>"
node scripts/d3-review/contracts.mjs check "<packet-goc>" "<review-kit>\cases.json" "<thu-muc-contract-da-tao>"
node --test test/d3-contracts.test.mjs
```

Builder kiểm tra transfer hash, manifest, SHA-256 và Git blob của trích dẫn; Reactive Resume được đọc qua Git-object API, không follow symlink. Nó chỉ đọc Git object lịch sử bằng host Git, không checkout/chạy code upstream, không fetch và không gọi ArchSync/baseline để dự đoán.

Gói có `contract.json` (rule, source URL, line, quote, hash), `historical-context.json` và ba policy fragment. Hash xác nhận bytes, không xác nhận lập luận khoa học, chữ ký hay sự độc lập của reviewer.

## Việc tiếp theo của Hiếu và Hoàng

- Đọc sáu rule, sửa hoặc chấp nhận phạm vi cụ thể, đặc biệt hai rule API-package của Reactive Resume đang ngoài phạm vi changed-file trực tiếp. Không mở rộng dataset âm thầm.
- Chốt applicability và dữ liệu ngữ cảnh lịch sử, common-capability cùng expected model/observation inventory còn thiếu. Chốt phiên bản/hash rubric, scope, tool pins và analysis plan; chưa đổi `method.json` thành accepted chỉ vì builder pass.
- Sau đó mỗi người hoặc AI được phép đọc source và chuẩn bị nhãn/evidence; giữ riêng bản nhãn ban đầu, khai mức độ AI hỗ trợ và phần output đã tiếp xúc. Hai người đều liên quan phát triển tool và đã khai có tiếp xúc output; ghi là author-associated, nonblind exploratory annotation, không gọi blind hoặc independent external validation. Nếu dùng chung đề xuất AI thì không báo hai bản nhãn là độc lập với nhau.
- Giữ cả hai bản ban đầu, đối chiếu sau khi chốt, giải quyết bất đồng bằng đồng thuận; không đồng thuận thì Unknown. Chỉ sau freeze nhãn/method mới chạy công cụ và lưu toàn bộ lỗi/raw output.

Bản đề xuất này không hoàn tất D3, không cung cấp acceptance thay con người và không cập nhật kết quả lên paper/Overleaf.
