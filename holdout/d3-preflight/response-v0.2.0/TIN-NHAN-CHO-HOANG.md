# Tin nhắn đề xuất gửi Hoàng

Đây là bản nháp để Hiếu đọc và gửi nếu đồng ý với nội dung; chưa được đăng lên GitHub hoặc gửi cho Hoàng. Không phải một approval tự sinh.

Hoàng, mình đã nhờ đối chiếu gói preflight với packet gốc: 434 file snapshot, 60 cặp commit và 214 lượt path đều khớp. PR #14/#15 đang có ba check CI PASS nhưng vẫn chờ review.

Mình đề xuất chốt theo D3-AUTHOR-PREFLIGHT candidate v0.2.0 đính kèm:

- Hiếu và Hoàng làm hai lượt review ban đầu riêng, giữ nhãn riêng và chưa xem prediction. Cả hai khai đúng vai trò phát triển/tiếp xúc source/AI; paper ghi author-associated review, không gọi external independent validation. Không yêu cầu thêm reviewer thứ ba cho thiết kế này.
- Giữ đủ 60 case trong inventory. Đề xuất 56 case vào phần chính; bốn case chỉ đổi test giữ làm context-only, không tự gán no-impact. Giữ 322 file snapshot ứng viên chính, các file đề xuất loại vẫn được giữ làm ngữ cảnh.
- H019 của Etherpad giữ trong phần chính; tar.json là ngữ cảnh bắt buộc, không thành TS module-edge hoặc một case riêng.
- Dùng rubric và Unknown/accounting trong tài liệu; Unknown không được tính đúng hoặc tính TN, lỗi/abstention không được loại khỏi bảng accounting để làm đẹp điểm. Mỗi người giữ bản nhãn gốc trước khi cùng giải quyết bất đồng.

Có mấy điểm phải hoàn thiện trước khi bắt đầu nhãn chính thức: sáu rule hiện tại mới là module policy, chưa đủ expected runtime contract; semantics require/dynamic/type-only chưa khớp adapter static ESM; các rule Reactive Resume vượt scope hiện tại chưa thể coi là đã được kiểm thử. Phần runner input và normalizer/common-capability cũng cần chốt/test bằng fixture phát triển trước, chưa chạy D3.

Bạn xem file REVIEW-VA-DE-XUAT-CHOT.md và scope-proposal.json giúp mình. Mình muốn hai bên thống nhất bản này và khai vai trò/exposure riêng trước, rồi hoàn thiện các phần kỹ thuật/ngữ nghĩa còn thiếu. Tin nhắn này không phải lệnh cho chạy prediction hay xác nhận D3 đã xong.
