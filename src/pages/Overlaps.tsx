import { AppLayout } from "@/components/AppLayout";
import { DataManager } from "@/components/DataManager";

export default function Overlaps() {
  return (
    <AppLayout title="PQ 기술자별 업무중첩도 관리">
      <DataManager
        table="technician_overlaps"
        exportName="PQ업무중첩도"
        searchKeys={["technician_name", "project_name"]}
        fields={[
          { key: "technician_name", label: "기술자명", required: true },
          { key: "project_name", label: "사업명", required: true },
          { key: "start_date", label: "시작일", type: "date", required: true },
          { key: "end_date", label: "종료일", type: "date", required: true },
          { key: "participation_rate", label: "참여율(%)", type: "number" },
          { key: "notes", label: "비고", type: "textarea" },
        ]}
      />
    </AppLayout>
  );
}
