import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Bids from "@/pages/Bids";

const db = vi.hoisted(() => ({ records: [] as Record<string, unknown>[], update: vi.fn() }));
vi.mock("@/components/AppLayout", () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "test-user" } }) }));
vi.mock("@/components/BidParticipation", () => ({
  BidParticipationBadge: () => null,
  BidParticipationSelect: ({ value, label, onChange }: { value: string | null; label: string; onChange: (value: string | null) => void }) =>
    <select aria-label={label} value={value || ""} onChange={e => onChange(e.target.value || null)}><option value="">미분류</option><option>대표참여</option><option>도급참여</option></select>,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  functions: { invoke: async () => ({ data: { error: "waiting" }, error: null }) },
  from: () => ({
    select: () => ({ order: async () => ({ data: db.records, error: null }) }),
    update: (values: Record<string, unknown>) => ({ eq: async (_key: string, id: string) => {
      db.update(values, id);
      db.records = db.records.map(r => r.id === id ? { ...r, ...values } : r);
      return { error: null };
    } }),
  }),
} }));

describe("입찰 참여 구분 저장", () => {
  beforeEach(() => {
    db.update.mockClear();
    db.records = [{ id: "bid-1", project_name: "분류 확인 사업", status: "검토중", participation_type: null, notify_hours_before: 24 }];
  });
  afterEach(cleanup);

  it.each(["대표참여", "도급참여"])("%s 선택을 해당 사업에 저장하고 다시 조회해 유지한다", async type => {
    const view = render(<Bids />);
    fireEvent.change(await screen.findByRole("combobox", { name: "분류 확인 사업 참여 구분" }), { target: { value: type } });
    await waitFor(() => expect(db.update).toHaveBeenCalledExactlyOnceWith({ participation_type: type }, "bid-1"));
    view.unmount();
    render(<Bids />);
    expect(await screen.findByRole("combobox", { name: "분류 확인 사업 참여 구분" })).toHaveValue(type);
  });

  it("개찰완료로 이동해도 대표참여 분류를 보존한다", async () => {
    db.records[0].participation_type = "대표참여";
    render(<Bids />);
    const select = await screen.findByRole("combobox", { name: "분류 확인 사업 참여 구분" });
    const row = select.closest("tr");
    if (!row) throw new Error("사업 행이 없습니다");
    fireEvent.click(within(row).getByTitle("개찰완료로 이동"));
    await waitFor(() => expect(db.update).toHaveBeenCalledExactlyOnceWith({ status: "개찰완료" }, "bid-1"));
    expect(db.records[0].participation_type).toBe("대표참여");
    fireEvent.click(screen.getByRole("tab", { name: /개찰완료/ }));
    expect(await screen.findByRole("combobox", { name: "분류 확인 사업 참여 구분" })).toHaveValue("대표참여");
  });
});