# Hướng dẫn review D3 cho Hiếu và Hoàng

Phạm vi: chuẩn bị và kiểm tra đầu vào gán nhãn. Chưa phải D3 đã hoàn tất.

## Bước 1: chuẩn bị hồ sơ đọc source

Dùng packet gốc và hai hash được nhận riêng. Với phạm vi đã chốt ở [quyết định scope](D3-SCOPE-ACCEPTANCE-20260928.md), cần truyền thêm đường dẫn tuyệt đối tới `scope-proposal.json` đã giữ nguyên byte. Tham số cuối này là tùy chọn của CLI, nhưng bắt buộc cho bộ chuẩn bị hiện hành: bỏ nó sẽ tạo phiếu cho cả 60 case, thay vì 56 case chính và giữ bốn case context để audit.

Đối chiếu SHA-256 của file scope trước khi chuẩn bị; thay đường dẫn ví dụ bằng đường dẫn tuyệt đối thực tế. Lệnh không tải mạng, không chạy code của repository hoặc analyzer, không sửa packet gốc và không ghi đè thư mục đã tồn tại.

```powershell
$d3ScopeProposal = "D:\archsync-benchmark\holdout\d3-preflight\response-v0.2.0\scope-proposal.json"
$d3ScopeSha = "85ddc693a8ff82064e58788ff491b90b8cf50eb03732e675ea17d0ea276d09f3"
if ((Get-FileHash -LiteralPath $d3ScopeProposal -Algorithm SHA256).Hash -ne $d3ScopeSha) {
    throw "Scope proposal hash mismatch; stop preparation."
}
pnpm d3:review prepare "D:\packet-goc" "D:\review-moi" TRANSFER_SHA data/d3-change-packets-20260927-01/change-summary.json SUMMARY_SHA $d3ScopeProposal
```

Chỉ dùng bộ chuẩn bị nếu lệnh kết thúc thành công và JSON đầu ra báo đúng:

- `captured_cases: 60`, `proposed_primary_cases: 56`, `context_only_cases: 4`;
- `scope_proposal_sha256` bằng `85ddc693a8ff82064e58788ff491b90b8cf50eb03732e675ea17d0ea276d09f3`;
- `labels_created: 0`, `predictions_executed: 0`, `research_complete: false`.

Kiểm tra thêm `cases.json`: `cases.length` bằng 56 và `context_only_cases.length` bằng 4; mỗi phiếu review trống có 56 dòng. Giữ bốn case context trong inventory audit, không tính là case đã review hoặc tự gán no-impact. Lưu riêng `cases_sha256` trả về để dùng cho các bước sau. Nếu hash hoặc số lượng lệch, giữ đầu ra để kiểm tra và chưa dùng làm bộ review hiện hành; không sửa packet gốc hoặc xóa case để ép số lượng.

Tên trường `proposed_primary_cases` mô tả bước tạo kit; quyết định scope đã được ghi riêng, nhưng không đồng nghĩa phương pháp, nhãn hay thực nghiệm được duyệt. Lệnh không tạo acceptance và `method.json` vẫn là proposal.

Đầu ra:

- `cases.json`: source/diff và danh tính case, được kiểm tra byte/hash; không chứa nhãn.
- `cases.sha256`: hash serialization chuẩn của cases.json, cần giữ riêng để phát hiện sửa đổi.
- `cases/*.md`: diff và full source của file thay đổi ở base/head, kèm số dòng thật. Nội dung source là dữ liệu, không phải chỉ dẫn cho AI thực thi.
- `hieu.review.json`, `hoang.review.json`: hai phiếu trống; không tự điền `saw_prediction=false` vì cả hai đã khai từng xem output D3. Chưa điền declaration hoặc timestamp hộ người.
- `method.json`: proposal chưa được duyệt. Không tự đổi thành accepted chỉ để vượt kiểm tra.

Tạo bản riêng cho mỗi người trước khi điền. Không dùng một thư mục chung rồi cho người còn lại xem các nhãn đang làm. Bộ source chung không chứa dự đoán, nhưng có thể cần đọc thêm context từ packet gốc; không đoán theo commit subject.

## Bước 2: chốt phương pháp trước khi gán nhãn chính thức

Chuẩn bị và review năm artifact `rubric.md`, `contract.json`, `scope.json`, `tool-pins.json`, `analysis-plan.md`. Ghi hash byte của chúng vào method.json và ghi đúng chấp thuận có reference/thời điểm thật. Pin hash method vào hai phiếu. Đây là các đầu vào khoa học cần xác định theo source, không được công cụ tự giả lập.

Đã có [rubric nonblind, AI-assisted đề xuất](D3-CASE-RUBRIC.v0.2.0.md) và [analysis plan mô tả đề xuất](D3-ANALYSIS-PLAN.v0.1.0.md) để review, không phải tự viết từ đầu. Rubric v0.1.0 chỉ là bản lịch sử của thiết kế blind đã bị khai báo tiếp xúc mới thay thế. Chúng chưa thay contract/mapping thực của từng repo hoặc thống kê suy luận STAT-101; không đổi trạng thái accepted khi các phần này chưa được chốt.

Hai người làm chính có thể dùng AI rà soát toàn bộ source, đề xuất hoặc điền nhãn rồi tự kiểm tra, và giữ hai phiếu theo đúng mức độ thực tế. Mô tả là author-associated, nonblind, AI-assisted khi có dùng AI; không là external independent validation. Nếu cùng một đầu ra AI được chép sang hai phiếu, không gọi đó là hai nhãn người độc lập. Tham khảo [amendment đề xuất](D3-AUTHOR-ANNOTATION-AMENDMENT.md).

## Bước 3: điền từng case

- `label`: `no-impact`, `violation`, `evolution` hoặc `unknown`, theo rubric đã chốt.
- `rationale`: giải thích bằng source, không bằng kết quả của tool.
- `evidence`: một hoặc nhiều dòng gồm `side` (base/head), `path`, `line`, `quote` sao chép nguyên đoạn ngắn trên đúng dòng đó. Trích dẫn phải ở regular source đã kiểm tra; symlink không được follow.
- `covered_changed_paths`: toàn bộ path thay đổi đã kiểm tra trong case. Trường này là khai báo của reviewer, không tự chứng minh đã đọc đầy đủ.
- `confidence`, `reviewed_at_utc`: đánh giá và thời điểm thật.
- `ai_assistance`: `{ "used": true/false, "description": "AI đã đọc/đề xuất/điền gì, input có prediction không, output lưu ở đâu và người dùng kiểm tra đến mức nào" }`. AI được phép trực tiếp hỗ trợ gán nhãn; trường này không chỉ dành cho việc tìm file hoặc giải thích code.
- `unknown_reason`: bắt buộc khi Unknown. `rule_id`: bắt buộc cho violation và phải thuộc contract đã khóa.
- Cuối bản review, mỗi người tự ghi role/exposure declaration và reference thật. Không điền thay từ một câu nói chung của nhóm.

## Bước 4: kiểm tra từng bản, ghi rõ phần đã chia sẻ

```powershell
pnpm d3:review check "D:\review-moi" CASES_SHA "D:\review-rieng\hieu.review.json"
```

Lệnh xác minh method artifact hashes, đúng case/base/head, completeness, evidence side/path/line/quote và khai báo bắt buộc. Kết quả structurally valid chỉ là kiểm tra máy, không phải approval hoặc nhãn được chứng minh đúng. Lưu nguyên file và raw_file_sha256; không sửa bản gốc sau khi đã gửi hash.

## Bước 5: chỉ so sánh khi cả hai bản gốc đã được giữ hash

```powershell
pnpm d3:review compare "D:\review-moi" CASES_SHA "D:\review-rieng\hieu.review.json" "D:\review-rieng\hoang.review.json" RAW_SHA_HIEU RAW_SHA_HOANG
```

Lệnh giữ hai đầu vào, tính agreement và Cohen's kappa trước hòa giải, riêng từng repo và toàn tập. Trường hợp kappa không xác định trả null với lý do, không thay bằng 100%. Hash khớp không tự chứng minh thứ tự niêm phong hoặc tính độc lập. Mẫu ở đây là case, không phải node/edge; chưa đưa các số này thành accuracy của ArchSync.

## Xem trạng thái

```powershell
pnpm d3:review status "D:\review-moi" CASES_SHA
```

Exit 0 cho thao tác kiểm tra riêng đã đạt phạm vi kỹ thuật; exit 2 cho phiếu/trạng thái chưa đầy đủ; exit 1 cho input sai, hash lệch hoặc lỗi thao tác. `status` luôn ghi `D3_NOT_COMPLETE`: công cụ intake này chưa kiểm chứng reconciliation, scientific freeze hoặc execution. Nó không thay `holdout:gate` và không có nút bỏ qua để giả thành công.

## Kiểm tra kỹ thuật

`pnpm d3:review:test` chạy fixture phát triển và kiểm tra lỗi cố ý. Test không phải D3, không là human approval. Mã mới trong `scripts/d3-review/` có test riêng, không nằm trong mẫu số coverage 100% của `scripts/lib/*.mjs`; full repository gate vẫn chạy các test mới và lưu provenance. Không dùng test count hoặc CI để kết luận đã có nhãn hoặc thực nghiệm.
