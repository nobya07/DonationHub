import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { API_BASE_URL } from '../services/api';
import { CollectorRoute } from '../components/CollectorRoute';
import { CollectorLayout } from '../layouts/CollectorLayout';
import { ReceiptDetails } from './ReceiptDetails';

const RECEIPT_TOKEN_PATTERN = /^[0-9a-f]{32}$/;

export function PublicReceipt() {
  const { receiptNo } = useParams<{ receiptNo: string }>();

  const isToken = receiptNo ? RECEIPT_TOKEN_PATTERN.test(receiptNo) : false;

  if (!receiptNo) {
    return <Navigate to="/" replace />;
  }

  if (isToken) {
    // Public token links always open the server-generated receipt PDF
    // directly, so old /receipt/<token> URLs redirect to the PDF endpoint.
    window.location.replace(`${API_BASE_URL}/api/receipt/${encodeURIComponent(receiptNo)}`);
    return null;
  }

  // Collector receipt page: same URL and layout as before, but rendered
  // here so the /receipt/:receiptNo public route can share the path.
  return (
    <Routes>
      <Route
        element={
          <CollectorRoute>
            <CollectorLayout />
          </CollectorRoute>
        }
      >
        <Route index element={<ReceiptDetails />} />
      </Route>
    </Routes>
  );
}
