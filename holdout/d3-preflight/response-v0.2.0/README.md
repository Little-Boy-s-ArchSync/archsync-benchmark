# Phản hồi gói preflight D3

Đọc [REVIEW-VA-DE-XUAT-CHOT.md](REVIEW-VA-DE-XUAT-CHOT.md) trước. Đây là candidate v0.2.0 để Hiếu/Hoàng quyết định, không phải protocol đã accepted hoặc đã freeze.

Các file:

- `REVIEW-VA-DE-XUAT-CHOT.md`: kết quả đối chiếu, scope, vai trò, rubric, Unknown, điểm không tương thích contract/adapter và phần chưa đủ điều kiện.
- `scope-proposal.json`: từng file/case/path có pin và vai trò đề xuất; không chứa nhãn hay acceptance.
- `verification.json`: kết quả kiểm tra source thật và phạm vi giới hạn của phép kiểm tra.
- `github-status.json`: trạng thái read-only của PR #14/#15 tại thời điểm đọc, không phải review approval.
- `verify-preflight.ps1`: script đối chiếu độc lập với script Python trong gói nhận. Đọc các path mặc định hoặc truyền path của bạn; để chạy lại, tạo một thư mục output mới và truyền `-OutputDir`, vì script không ghi đè kết quả cũ.
- `TIN-NHAN-CHO-HOANG.md`: tin nhắn nháp để Hiếu đọc rồi tự gửi nếu đồng ý.
- `RESPONSE-MANIFEST.json`: hashes của các file trên, không phải chữ ký hay xác nhận của con người.

Đây chỉ là gói tài liệu, inventory và đề xuất. Không chứa source blobs, nhãn review riêng hoặc prediction D3. Các source packet được tham chiếu phải được giữ nguyên cùng license/provenance gốc. Không công bố index/packet lên nơi công khai nếu chưa chốt quyền chia sẻ dữ liệu.

Không gửi các file này rồi nói D3 đã hoàn tất. Các điểm contract runtime, applicability, common-capability, runner và human role/exposure vẫn phải được giải quyết trước bước tương ứng.
