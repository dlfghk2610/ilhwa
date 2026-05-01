import { AppLayout } from "@/components/AppLayout";
import { DataManager } from "@/components/DataManager";

export default function Performances() {
  return (
    <AppLayout title="PQ 개인별 실적관리">
      <DataManager
        table="personal_performances"
        exportName="PQ개인별실적"
        searchKeys={["technician_name", "project_name", "client"]}
        fields={[
          { key: "technician_name", label: "기술자명", required: true },
          { key: "project_name", label: "사업명", required: true },
          { key: "client", label: "발주처" },
          { key: "start_date", label: "시작일", type: "date" },
          { key: "end_date", label: "종료일", type: "date" },
          { key: "role", label: "직무" },
          { key: "performance_amount", label: "실적금액", type: "number" },
          { key: "notes", label: "비고", type: "textarea" },
        ]}
      />
    </AppLayout>
  );
}
