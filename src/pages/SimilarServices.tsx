import { AppLayout } from "@/components/AppLayout";
import { DataManager } from "@/components/DataManager";

export default function SimilarServices() {
  return (
    <AppLayout title="PQ 유사용역 (회사실적)">
      <DataManager
        table="similar_services"
        exportName="PQ유사용역"
        searchKeys={["project_name", "client", "service_type"]}
        fields={[
          { key: "project_name", label: "사업명", required: true },
          { key: "client", label: "발주처" },
          { key: "contract_amount", label: "계약금액", type: "number" },
          { key: "contract_date", label: "계약일", type: "date" },
          { key: "completion_date", label: "준공일", type: "date" },
          { key: "service_type", label: "사업유형" },
          { key: "notes", label: "비고", type: "textarea" },
        ]}
      />
    </AppLayout>
  );
}
