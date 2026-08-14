# ArchSync CLI — Hướng dẫn demo nhanh

Tài liệu này dành cho phần trình bày trực tiếp. Demo dùng patch Git thật, source
TypeScript thật và ground truth đã lưu trong benchmark; không dùng kết quả mock.

## Chuẩn bị một lần

Yêu cầu Node.js 22 trở lên, Git và pnpm 11. Các lệnh giống nhau trên Windows,
macOS và Linux:

```text
pnpm install --frozen-lockfile
```

## Demo khuyến nghị

Chạy duy nhất:

```text
pnpm demo
```

CLI sẽ lần lượt áp ba patch độc lập vào repository Git tạm và hiển thị:

1. `PASS`: refactor nội bộ, topology không đổi.
2. `BLOCK`: Frontend gọi thẳng Payment Service, vi phạm `ARCH-001`.
3. `REVIEW`: Order Service thêm Redis, topology mới cần con người phê duyệt.

Mỗi case phải đồng thời đúng classification, merge decision, tập file thay đổi
và cache transition `MISS -> HIT`; nếu sai một điều kiện, demo trả exit code 1.
Các quyết định `BLOCK` và `REVIEW` đúng ground truth không làm wrapper demo thất
bại. Trong CI gate thật, ArchSync vẫn trả exit 1 cho `BLOCK` và exit 3 cho
`REVIEW`.

## Câu giải thích trong 30 giây

> `architecture.yaml` là kiến trúc đã được phê duyệt. ArchSync đọc source
> TypeScript để dựng Observed Graph rồi so sánh hai graph. Refactor không đổi
> topology được pass; dependency vi phạm hard rule bị block; topology mới không
> vi phạm rule vẫn phải review. Finding có file và dòng code để lập trình viên
> biết chính xác vì sao có quyết định đó.

## Khi cần đi sâu

```text
pnpm demo:pass
pnpm demo:block
pnpm demo:review
pnpm demo --scenario block --verbose
pnpm demo --scenario all --json
```

`--verbose` hiển thị toàn bộ finding, architecture delta, phạm vi incremental và
cache. `--json` dành cho tích hợp máy. Các command `demo:phase3:*`, `demo:case06`
và `demo:case09` cũ vẫn được giữ để tái lập chính xác các case trước đây.

## Chứng minh không phải số liệu viết tay

```text
pnpm verify
```

Gate này kiểm tra hash package, model, 20 patch, 40 detector signals, tài liệu,
mutation checks, Phase 2 full scans và Phase 3 incremental/full-scan equivalence.
Số liệu nghiên cứu nằm trong `evidence/`; output của `pnpm demo` chỉ là cách trình
bày gọn các lần chạy thật, không thay thế evaluation đầy đủ.

## Nếu dùng unified product CLI

Từ repository `archsync-guardian` cạnh benchmark:

```text
pnpm doctor
pnpm demo
```

Package Guardian v0.3.1 cung cấp binary `archsync`, bao gồm toàn bộ model, scan,
source check, Git-diff gate, benchmark, diagram và demo commands. Binary tương
thích cũ `archsync-guardian` vẫn hoạt động.
