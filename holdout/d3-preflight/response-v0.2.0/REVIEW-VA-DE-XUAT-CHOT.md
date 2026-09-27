# D3: đối chiếu gói Hoàng gửi và đề xuất chốt trước gán nhãn

Document ID: D3-AUTHOR-PREFLIGHT. Candidate version: 0.2.0.

Trạng thái: đề xuất để Hiếu và Hoàng đọc và quyết định. Chưa được chấp nhận, không phải approval, dataset freeze hay lệnh cho phép chạy D3. Đây không phải phiên bản protocol SLR.

## 1. Kết luận kiểm tra

Gói chuẩn bị của Hoàng khớp với dữ liệu gốc trong phạm vi đã kiểm tra. Nó đủ để thảo luận và chốt các lựa chọn trước gán nhãn, nhưng chưa đủ để bắt đầu thí nghiệm chính thức. Hai tác giả có thể thực hiện hai lượt review ban đầu riêng; cần sửa mô tả phương pháp cho đúng, không gọi là đánh giá độc lập bên ngoài.

Đã kiểm tra trực tiếp 20 file trong preparation manifest, ba source manifest, toàn bộ 434 dòng snapshot, 60 cặp commit và 214 lượt path thay đổi. SHA-256/Git blob của source được đối chiếu với packet gốc; không chỉ tin tổng số do script của người gửi ghi ra. Không chạy hai script Python trong ZIP.

| Repo | TS/TSX snapshot hiện có | Ứng viên file chính sau bộ lọc đề xuất | Case giữ trong inventory | Ứng viên case chính |
| --- | ---: | ---: | ---: | ---: |
| HyperDX | 268 | 167 | 20 | 19 |
| Reactive Resume | 33 | 22 | 20 | 17 |
| Etherpad | 133 | 133 | 20 | 20 |
| Tổng | 434 | 322 | 60 | 56 |

Trong 112 file đề xuất không thuộc population chính có 111 test/fixture và 1 declaration. Trong 214 lượt path thay đổi có 150 lượt production-TS ứng viên, 63 lượt test/fixture và 1 lượt JSON. Các lượt này gồm 138 path phân biệt theo repo và 99 endpoint commit phân biệt theo repo. Không cộng hoặc coi chúng là các mẫu độc lập.

322 và 56 là kết quả áp bộ lọc đang đề xuất, không phải số ground-truth item, số ca chạy thành công hoặc số ca sẽ chắc chắn tính được accuracy. Việc file là generated, fixture được production sử dụng, hoặc phụ thuộc ngữ cảnh ngoài scope vẫn cần kiểm tra; không chứng nhận cả 322 file chỉ dựa vào tên đường dẫn.

Xem [verification.json](verification.json), [script đối chiếu](verify-preflight.ps1) và [scope-proposal.json](scope-proposal.json). Hai template quyết định/role của Hoàng không bị điền hộ; không có nhãn được tạo.

## 2. Scope đề xuất để quyết định một lần

- Giữ nguyên ba repo, snapshot SHA và toàn bộ 60 case ID trong inventory. Không thay repo hoặc bổ sung ca để làm điểm đẹp.
- Population snapshot chính đề xuất: 322 file TS/TSX chưa có dấu hiệu test/fixture/declaration theo bộ lọc; giữ 112 file còn lại làm ngữ cảnh và trong exclusion log. Bộ này chỉ là backend scope đã nêu, không phải toàn bộ hệ thống runtime.
- Population change-case chính đề xuất: 56 case có ít nhất một path production-TS ứng viên. Giữ bốn ca dưới đây là `context-only / outside-primary-scope`, không gán nhãn `no-impact`, không tính chúng vào accuracy chính và không xóa khỏi inventory.
- Không loại toàn bộ một case hỗn hợp chỉ vì có test. Giữ toàn bộ diff và path để giải thích ngữ cảnh; chỉ phân biệt denominator của từng loại observation.
- Với file bị loại theo tên nhưng thực tế được production sử dụng, phải ghi ngoại lệ có bằng chứng và cập nhật scope trước nhãn/prediction. Không thay scope sau khi thấy kết quả để cải thiện điểm.

| Case dự kiến chỉ làm ngữ cảnh | Path thay đổi |
| --- | --- |
| hyperdxio--hyperdx-H016 | packages/api/src/routers/api/__tests__/clickhouseProxy.int.test.ts |
| amruthpillai--reactive-resume-H002 | apps/server/src/openapi/generator.test.ts |
| amruthpillai--reactive-resume-H012 | apps/server/src/openapi/generate-spec.test.ts |
| amruthpillai--reactive-resume-H018 | apps/server/src/static/web.test.ts |

Riêng Etherpad H019: giữ case trong population ứng viên chính. Đọc cả `src/node/utils/tar.json` như ngữ cảnh bắt buộc vì diff có thay đổi danh sách tài nguyên; ba path TypeScript cùng case vẫn được xét. JSON không trở thành một TS module hoặc một ca độc lập. Quyết định này chưa gán nhãn kiến trúc cho H019. Nếu tác động liên quan nằm ngoài source được duyệt, ghi Unknown hoặc bổ sung ngữ cảnh theo phiên bản, không tự kết luận vô tác động.

`scope-proposal.json` chứa từng file/case/path cùng pin và vai trò đề xuất. Tất cả trường nhãn vẫn null, `human_acceptances` vẫn rỗng.

## 3. Hai tác giả, không tự nhận độc lập bên ngoài

Đề xuất reviewer A là Võ Đức Hiếu, reviewer B là Trần Minh Hoàng. Cả hai là development-associated authors. Không mặc định cần Kiệt, Bách hay thầy làm reviewer thứ ba để vận hành thiết kế này; đồng thời không dùng thiết kế này để tuyên bố external independent validation.

Mỗi người xác nhận riêng: phần Core/Guardian/rule/benchmark/prompt đã tham gia, source đã tiếp xúc, có từng dùng D3 để chỉnh tool không, đã xem prediction/trace/nhãn của người kia chưa, và AI sẽ hỗ trợ phần nào. Việc Hiếu đã báo trong cuộc trò chuyện rằng cả hai chưa xem prediction hoặc dùng D3 để chỉnh tool được giữ như thông tin do Hiếu cung cấp; không biến thành chữ ký hay xác nhận cá nhân của Hoàng.

Hai lượt đầu giữ riêng, không chia sẻ nhãn/reason/confidence và không xem output công cụ. Cùng dùng rubric không có nghĩa cùng dùng một bảng đáp án AI. Giữ hai bản gốc và hash trước trao đổi; hash không tự chứng minh thời điểm hoặc người review. Sau đó tính agreement từ bản gốc, cùng giải quyết bất đồng, không đồng thuận thì giữ Unknown. Không sửa agreement ban đầu để đạt ngưỡng đẹp.

## 4. Rubric đề xuất thống nhất

Giữ taxonomy component, runtime relationship, module edge và change-case tách biệt. Giữ các reason code Unknown trong rubric của Hoàng. Một module/folder không tự động là runtime component; import không tự động là HTTP/data edge.

Một case có một nhãn chính. Nếu bằng chứng/phạm vi/quy tắc chưa đủ để chốt nhãn của toàn ca thì Unknown và nêu điều còn thiếu. Nếu đủ, ưu tiên `violation`, rồi `evolution`, rồi `no-impact`; giữ các quan sát phụ và vi phạm đã tồn tại riêng. `Violation` cần quy tắc có hiệu lực cho cùng cặp base/head. `Evolution` cần chứng minh thay đổi kiến trúc, không phải chỉ thấy file thay đổi. `No-impact` cần coverage review trong scope, không được suy từ tool im lặng hoặc case chỉ đổi test.

Confidence dùng 0-1: 0 là không đủ chắc chắn về diễn giải, 0.5 là bằng chứng một phần, 1 là căn cứ source rõ theo scope/rule đã chốt; người review có thể dùng giá trị giữa các mốc. Không có ngưỡng tự biến Unknown thành known, không điền confidence cho bản chưa review, và 1 không có nghĩa xác suất thực nghiệm 100%.

Mỗi ca cần repo, base/head, path/side/line, trích dẫn đúng bytes, rationale, confidence, coverage các path đã được giao và disclosure AI thật. Các ngữ cảnh ngoài dossier phải được giữ với commit/hash trước khi dùng làm evidence.

## 5. Chỉnh phần contract và comparator trước khi chốt

Đây là điểm chưa thể chấp nhận trọn gói trong bản hiện có:

1. Sáu rule trong contract 0.1.0 trước đó là **module policy**, không phải expected runtime model đầy đủ. Chúng chưa đủ để gán nhãn vi phạm HTTP/database/runtime cho paper. Graph fragment có `relationships: []` không được đưa thẳng vào graph diff để gọi mọi cạnh là evolution.
2. Contract 0.1.0 trước đó đề xuất value import, re-export, literal `require()` và dynamic `import()`. Adapter local `archsync-static-esm` tại commit `7ec37fc27536080603a42c9f025462b48048f817` khai version **0.1.1**, chỉ xử lý static ESM declaration, có gồm type-only; `require()` và dynamic `import()` tạo issue/incomplete. Đây là khác biệt semantics, không phải lỗi được phép bỏ qua. Gói Hoàng nhắc 0.1.0; cần chốt đúng một code/package hash trước sử dụng.
3. Source graph của adapter dùng ID từng file; sáu rule đề xuất dùng nhóm module. Chưa có chứng cứ normalizer/group mapping hai bên cho cùng kết quả. Không so hai đơn vị này như nhau.
4. Hai rule nguồn `api-package` của Reactive Resume chưa có coverage từ scope changed-file `apps/server/src`. Target `apps/web/src` cũng ngoài scope đó. Không báo chúng là đã pass hoặc âm tính nếu source/target chưa được quan sát. Giữ riêng context rule, hoặc bổ sung scope có pin trước nhãn; không mở rộng âm thầm.

Đề xuất duy trì service-level D3 là mục tiêu nghiên cứu chính và module comparison là nhánh riêng, không đổi câu hỏi nghiên cứu sang import chỉ để dễ chạy. Với nhánh module, candidate semantics nên là static ESM import/re-export (gồm type-only vào TS source), không tính declaration-only target, builtin hoặc external package là internal TS edge; CommonJS/dynamic/ngoài scope vẫn ở bảng accounting. Đây là đề xuất sửa semantics, chưa phải adapter đã được chấp nhận. Nếu chọn value-only thay thế, phải có adapter/normalizer tương đương được test trên fixture phát triển trước, không tự đổi sau khi xem D3.

Phải hoàn thiện expected runtime model, quy tắc có căn cứ và applicability theo ca cho primary arm; source/target mapping và ground truth chung cho module arm. Không chỉnh analyzer dựa trên prediction D3. Có thể xây và test runner/normalizer trên fixture phát triển trong lúc các quyết định đang chờ.

## 6. Unknown và denominator: đề xuất đủ cụ thể để triển khai

Đối với change-case classification, lập một bảng truth status và một bảng tool status riêng. Unknown của ground truth có thể đồng thời gặp tool failed; không cộng các cột chồng lấn thành tổng số ca.

- `E`: tập case được chọn chính thức, chưa mặc định là 60. Đề xuất scope hiện cho 56 ứng viên, nhưng phải được chấp nhận.
- `C`: tập con capability-matched được chốt trước output cho từng arm/tool comparison. Không quyết định C bằng việc tool chạy thành công hay thất bại. Báo cả `|C|/|E|` và những trường hợp ngoài C.
- `K`, `U`: truth known và truth Unknown trong C; `|K| + |U| = |C|`.
- Tool status trên mỗi case: một giá trị trong valid-known-label, abstained-Unknown, failed, incomplete/inconclusive, unsupported, not-run. Giữ raw error và lý do; unexpected unsupported không được lén đưa case khỏi C.
- `V`: những case trong K có output hợp lệ thuộc tập nhãn nghiên cứu. `X`: số dự đoán đúng trong V.
- Conditional accuracy: `X / |V|`, luôn báo coverage `|V| / |K|` bên cạnh.
- Conservative execution success on known truth: `X / |K|`; failed/abstained/incomplete/unsupported/not-run trong K không được tính thành công.
- Unknown truth không là TN, không là no-impact và Unknown/Unknown không là dự đoán đúng. Giữ nguyên Unknown trong accounting; PR #15 chỉ chặn sai sót tính điểm, không tự chọn denominator cuối.
- Nếu mẫu số bằng 0, báo null/not estimable, không báo 0% hay 100%.

Sensitivity cho success trong C: với `U_valid` là số truth-Unknown có output known-label hợp lệ, báo hai kịch bản `X / |C|` và `(X + U_valid) / |C|`. Đây là biên theo giả định các truth-Unknown sau này giải được thành một nhãn hợp lệ, không phải accuracy quan sát hay confidence interval. Failed/abstained vẫn không được nhận success ở kịch bản trên. Không dùng công thức này làm biên precision/recall/F1.

Báo per-repository trước pooled; pooled chỉ descriptive. Không coi 60 case, 214 path hay hai lần chạy là các mẫu độc lập; không mặc định bootstrap/i.i.d. interval trên ba repo chọn có chủ đích. Node/edge precision-recall cần census ground truth riêng và matching policy, không suy ra từ 56 nhãn case.

## 7. Trạng thái kỹ thuật đã kiểm tra

- [Benchmark PR #14](https://github.com/Little-Boy-s-ArchSync/archsync-benchmark/pull/14), head `4b5eafda17eafc7767b71bda13ae9c6aaaeb3e70`: OPEN, REVIEW_REQUIRED, ba check Ubuntu/Windows/macOS SUCCESS tại lần đọc.
- [Benchmark PR #15](https://github.com/Little-Boy-s-ArchSync/archsync-benchmark/pull/15), head `136b0e970c06d6062bdf96a3737815042e97c9d3`: OPEN, REVIEW_REQUIRED, ba check Ubuntu/Windows/macOS SUCCESS tại lần đọc.
- Chi tiết thời điểm và URL job trong [github-status.json](github-status.json). Đây là kiểm tra trạng thái và đọc diff guard, không phải xác nhận đã thực hiện toàn bộ code review hoặc approve hai PR.
- Reactive Resume object reader và schema pass không chứng minh runner đã consume đúng population. Vẫn cần bridge bảo toàn provenance/symlink, read-set audit và synthetic tests trước official execution.
- Không có D3 label, prediction, research result, approval, push, merge hoặc cập nhật Sheet/Overleaf được tạo trong bước đối chiếu này.

## 8. Phạm vi có thể chấp nhận ngay và phần chưa thể

Hiếu/Hoàng có thể đọc để chấp nhận cụ thể: hai-author design ở mục 3, scope candidate ở mục 2, rubric ở mục 4 và accounting/Unknown ở mục 6. Khi đồng ý thật, ghi người, thời điểm thực tế và hash tài liệu, không backdate về trước capture.

Việc đồng ý các mục đó **không** đồng thời chấp nhận contract runtime còn thiếu, runner chưa được chứng minh, common-capability chưa được test, toàn bộ protocol cũ hoặc research execution. Các phần này cần hoàn thiện kỹ thuật/ngữ nghĩa, không phải thêm chữ ký cho hình thức.

Không cần hai người ký 434 dòng riêng: có thể chấp nhận chính xác một scope manifest gồm toàn bộ dòng bằng hash, với ngoại lệ được nêu rõ. Tuy nhiên xác nhận thật của mỗi reviewer về vai trò và exposure không được người còn lại/AI tự điền thay.

## 9. Pins của gói đề xuất

- ZIP nhận từ Hoàng: `76fa9d3ad76c3885ca7125d9e6a209f212b4534daaa127ee0c6e581fd5dcfe4a`.
- Preparation manifest: `c21baddc611b681bded782cfe5d0b81a063ac2431c1b13d256aba10d389ba99d`.
- Scope candidate của phản hồi này: `85ddc693a8ff82064e58788ff491b90b8cf50eb03732e675ea17d0ea276d09f3`.
- Contract module cũ, chưa accepted: `efff60a655ebc2eaf9819ddf1e15646c7cfe7f82f0cf8bb44d54464354fe3b8a`.

Bản cũ và ZIP nhận được được giữ nguyên. Những điểm bổ sung trên là phiên bản candidate mới, không chỉnh sửa evidence đã freeze hay giả định Hoàng đã đồng ý.
