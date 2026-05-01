import { AppLayout } from "@/components/AppLayout";
import { DataManager } from "@/components/DataManager";

export default function Bids() {
  return (
    <AppLayout title="입찰참가관리">
      <DataManager
        table="bid_participations"
        exportName="입찰참가관리"
        searchKeys={["project_name", "client", "status"]}
        fields={[
          { key: "project_name", label: "사업명", required: true },
          { key: "client", label: "발주처" },
          { key: "bid_date", label: "입찰일", type: "date" },
          { key: "estimated_amount", label: "추정금액", type: "number" },
          { key: "status", label: "상태" },
          { key: "notes", label: "비고", type: "textarea" },
        ]}
      />
    </AppLayout>
  );
}
