import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Overlaps from "@/pages/Overlaps";

const db = vi.hoisted(() => ({ records: [] as Record<string, unknown>[], update: vi.fn() }));
vi.mock("@/components/AppLayout", () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "test-user" } }) }));
vi.mock("@/lib/excel", () => ({ importFromExcel: vi.fn(), exportToExcel: vi.fn() }));
vi.mock("@/lib/pdf-name-mark", () => ({ findNameMarks: vi.fn(), drawCheckMark: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({ order: async () => ({ data: table === "technician_overlaps" ? db.records : [], error: null }) }),
      update: (values: Record<string, unknown>) => ({ eq: async (_key: string, id: string) => {
        db.update(values, id);
        db.records = db.records.map(row => row.id === id ? { ...row, ...values } : row);
        return { error: null };
      } }),
    }),
  },
}));

describe("업무중복도 하단 사업 이동", () => {
  beforeEach(() => {
    db.update.mockClear();
    db.records = Array.from({ length: 60 }, (_, i) => ({
      id: `project-${i}`, project_name: `사업 ${i}`, project_status: "진행중",
      start_date: "2026-01-01", end_date: "2026-12-31", participants: [], amendments: [], suspensions: [],
    }));
  });

  it("마지막 사업을 관리 버튼으로 준공으로 이동하고 다시 진행중으로 이동한다", async () => {
    render(<Overlaps />);
    fireEvent.click(await screen.findByRole("button", { name: "사업 59 준공으로 이동" }));
    await waitFor(() => expect(db.update).toHaveBeenCalledWith({ project_status: "준공" }, "project-59"));
    expect(screen.queryByRole("button", { name: "사업 59 준공으로 이동" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /준공 \(1\)/ }));
    fireEvent.click(await screen.findByRole("button", { name: "사업 59 진행중으로 이동" }));
    await waitFor(() => expect(db.update).toHaveBeenCalledWith({ project_status: "진행중" }, "project-59"));
  });

  it("마지막 사업을 준공 탭에 놓으면 해당 사업만 이동한다", async () => {
    render(<Overlaps />);
    const move = await screen.findByRole("button", { name: "사업 59 준공으로 이동" });
    const row = move.closest("tr");
    if (!row) throw new Error("사업 행이 없습니다");
    expect(within(row).getByText("사업 59")).toBeInTheDocument();
    const dataTransfer = { setData: vi.fn(), getData: () => "project-59", effectAllowed: "move" };
    fireEvent.dragStart(row, { dataTransfer });
    const target = screen.getByRole("button", { name: /준공 \(0\)/ });
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });
    await waitFor(() => expect(db.update).toHaveBeenCalledExactlyOnceWith({ project_status: "준공" }, "project-59"));
    fireEvent.click(target);
    expect(await screen.findByRole("button", { name: "사업 59 진행중으로 이동" })).toBeInTheDocument();
  });
});