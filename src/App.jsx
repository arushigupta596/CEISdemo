import { useState, useCallback, useRef } from "react";
import * as XLSX from "xlsx";

const INVENTORY = {
  CRE: {
    label: "Commercial Real Estate (CRE)",
    color: "#E8622A",
    items: [
      { id: "cre_account_history",   label: "Borrower Account History (outstanding, payments, delinquencies)", required: true,  keywords: ["account history","payment history","pay history","delinquency","outstanding","ttm","as agreed","loan history"] },
      { id: "cre_credit_proposal",   label: "Original & Latest Bank Credit Proposal / Credit Analysis / Annual Review", required: true,  keywords: ["credit proposal","credit analysis","annual review","underwriting","uw memo","credit memo"] },
      { id: "cre_committee",         label: "Latest Bank Credit Committee Approval", required: true,  keywords: ["credit committee","committee approval","loan approval","loan committee","approval memo"] },
      { id: "cre_fin_statements",    label: "Last 3 Years Financial Statements – Borrower (I&E, CTR, management accounts)", required: true,  keywords: ["financial statement","i&e","income expense","ctr","management accounts","fiscal","p&l","profit loss","balance sheet","borrower financials"] },
      { id: "cre_guarantor_fin",     label: "Guarantor Financials (PFS, PTR, etc.)", required: true,  keywords: ["pfs","personal financial","ptr","personal tax","guarantor","net worth statement"] },
      { id: "cre_appraisal",         label: "Latest Property Appraisal & Appraisal Review", required: true,  keywords: ["appraisal","valuation","appraised value","cap rate","income approach","sales comp","appraisal review"] },
      { id: "cre_bank_inspection",   label: "Latest Bank Inspection / Site Visit", required: true,  keywords: ["inspection","site visit","bank inspection","property inspection"] },
      { id: "cre_rent_roll",         label: "Latest Rent Roll", required: true,  keywords: ["rent roll","tenant schedule","lease schedule","tenancy","tenant list","occupancy"] },
      { id: "cre_third_party",       label: "Third-Party Rating Inputs", required: false, keywords: ["third party rating","risk rating input","rating agency"] },
      { id: "cre_covenant",          label: "Covenant Compliance Statement / Waivers / Amendments", required: false, keywords: ["covenant compliance","covenant certificate","compliance statement","waiver","amendment","dscr covenant"] },
    ],
  },
  CI: {
    label: "Commercial & Industrial (C&I)",
    color: "#E8622A",
    items: [
      { id: "ci_account_history",    label: "Borrower Account History (outstanding, payments, delinquencies)", required: true,  keywords: ["account history","payment history","pay history","delinquency","outstanding","ttm","loan history"] },
      { id: "ci_credit_proposal",    label: "Original & Latest Bank Credit Proposal / Annual Review", required: true,  keywords: ["credit proposal","credit analysis","annual review","underwriting","uw memo","credit memo"] },
      { id: "ci_committee",          label: "Latest Credit Committee Approval", required: true,  keywords: ["credit committee","committee approval","loan approval","approval memo"] },
      { id: "ci_collateral_val",     label: "Most Recent Collateral Valuation(s)", required: true,  keywords: ["collateral valuation","collateral value","appraisal","ucc","equipment appraisal"] },
      { id: "ci_abl_docs",           label: "Field Audit / Receivable Aging / Borrowing Base Certificate (if ABL)", required: false, keywords: ["field audit","receivable aging","a/r aging","borrowing base","bbc","abl"] },
      { id: "ci_projections",        label: "Financial Projections / Budgets", required: false, keywords: ["projection","budget","pro forma","proforma","forecast"] },
      { id: "ci_fin_statements",     label: "Last 3 Years Fiscal Financials + Interim Statements (10K, 10Q, CTR)", required: true,  keywords: ["financial statement","10k","10q","ctr","annual","interim","fiscal","income","balance sheet"] },
      { id: "ci_covenant",           label: "Covenant Compliance Statement / Waivers / Amendments", required: false, keywords: ["covenant compliance","covenant certificate","compliance statement","waiver","amendment"] },
      { id: "ci_third_party",        label: "Third-Party Rating Inputs", required: false, keywords: ["third party rating","risk rating input","rating agency"] },
      { id: "ci_info_memo",          label: "Information Memorandum (syndicated deals, past 24 months)", required: false, keywords: ["information memorandum","syndicated","info memo"] },
    ],
  },
  Resi: {
    label: "Residential (Resi)",
    color: "#E8622A",
    items: [
      { id: "resi_account_history",  label: "Borrower Account History (outstanding, payments, delinquencies)", required: true,  keywords: ["account history","payment history","pay history","delinquency","outstanding","ttm"] },
      { id: "resi_credit_proposal",  label: "Original & Latest Bank Credit Proposal / Annual Review", required: true,  keywords: ["credit proposal","credit analysis","annual review","underwriting","uw memo"] },
      { id: "resi_committee",        label: "Latest Bank Credit Committee Approval", required: true,  keywords: ["credit committee","committee approval","loan approval","approval memo"] },
      { id: "resi_fin_statements",   label: "Last 3 Years Financial Statements – Borrower", required: true,  keywords: ["financial statement","income","balance sheet","fiscal","p&l"] },
      { id: "resi_tax_returns",      label: "Last 3 Years Tax Returns – Borrower", required: true,  keywords: ["tax return","1040","ptr","individual tax","agi","personal tax"] },
      { id: "resi_credit_reports",   label: "Credit Reports", required: true,  keywords: ["credit report","fico","credit score","equifax","experian","transunion"] },
      { id: "resi_note_title",       label: "Note and Title", required: true,  keywords: ["promissory note","title","deed of trust","mortgage note","note date","title insurance"] },
      { id: "resi_appraisal",        label: "Latest Appraisal", required: true,  keywords: ["appraisal","valuation","appraised value","fnma","1004","urar","residential appraisal"] },
      { id: "resi_closing_docs",     label: "Closing Documents and Checklist", required: true,  keywords: ["closing","hud-1","settlement","closing disclosure","closing checklist"] },
      { id: "resi_legal_docs",       label: "All Legal Documents", required: true,  keywords: ["legal","mortgage","deed","lien","legal document","security instrument"] },
      { id: "resi_income_verify",    label: "Verification of Income", required: true,  keywords: ["income verification","w-2","paystub","voe","verification of income","employment verification"] },
      { id: "resi_liquidity_verify", label: "Verification of Liquidity", required: true,  keywords: ["liquidity","bank statement","asset verification","vod","verification of deposit","liquid assets"] },
      { id: "resi_re_taxes",         label: "Real Estate Tax / Insurance / Maintenance (subject + OREO)", required: true,  keywords: ["real estate tax","property tax","insurance","maintenance","hazard insurance","oreo"] },
      { id: "resi_condo",            label: "Condo Approval Information (if applicable)", required: false, keywords: ["condo","condominium","hoa","condo questionnaire"] },
      { id: "resi_application",      label: "Signed Application", required: true,  keywords: ["application","loan application","1003","uniform residential","signed application","urla"] },
      { id: "resi_appraisal_review", label: "Appraisal Review", required: true,  keywords: ["appraisal review","review appraisal","desk review","field review"] },
      { id: "resi_business_returns", label: "3 Years Business Returns (if applicable)", required: false, keywords: ["business return","1120","1065","schedule c","corporate return"] },
      { id: "resi_leases",           label: "Leases on OREO (if needed)", required: false, keywords: ["lease","oreo lease","rental agreement"] },
    ],
  },
  Leveraged: {
    label: "Leveraged Loan",
    color: "#E8622A",
    items: [
      { id: "lev_account_history",    label: "Borrower Account History (outstanding, payments, delinquencies)", required: true,  keywords: ["account history","payment history","pay history","delinquency","outstanding","ttm"] },
      { id: "lev_credit_proposal",    label: "Original & Latest Bank Credit Proposal / Annual Review", required: true,  keywords: ["credit proposal","credit analysis","annual review","underwriting","uw memo","credit memo"] },
      { id: "lev_committee",          label: "Latest Credit Committee Approval", required: true,  keywords: ["credit committee","committee approval","loan approval","approval memo"] },
      { id: "lev_collateral_val",     label: "Recent Collateral Valuations", required: false, keywords: ["collateral valuation","appraisal","equipment appraisal"] },
      { id: "lev_abl_docs",           label: "Field Audit / Receivable Aging / Borrowing Base Certificate (if ABL)", required: false, keywords: ["field audit","receivable aging","borrowing base","bbc","abl"] },
      { id: "lev_projections",        label: "Financial Projections / Budgets", required: false, keywords: ["projection","budget","pro forma","proforma","forecast"] },
      { id: "lev_fin_statements",     label: "Last 3 Years Financial Statements (Annual + Interim, 10K, 10Q, CTR)", required: true,  keywords: ["financial statement","10k","10q","ctr","annual","interim","audited","fiscal"] },
      { id: "lev_covenant",           label: "Covenant Compliance Statement / Global Debt Service", required: true,  keywords: ["covenant compliance","covenant certificate","global debt service","gdscr","compliance statement"] },
      { id: "lev_third_party",        label: "Third-Party Rating Inputs", required: false, keywords: ["third party rating","risk rating input","rating agency"] },
      { id: "lev_info_memo",          label: "Information Memorandum (syndicated, past 24 months)", required: false, keywords: ["information memorandum","syndicated","info memo"] },
      { id: "lev_quarterly_stmts",    label: "Quarterly Financial Statements", required: true,  keywords: ["quarterly","q1","q2","q3","q4","quarterly financial","quarterly statement","10q"] },
      { id: "lev_quarterly_analysis", label: "Quarterly Bank Financial Analysis", required: true,  keywords: ["quarterly analysis","quarterly bank","quarterly review","bank analysis"] },
    ],
  },
};

const ALL_ITEMS = Object.entries(INVENTORY).flatMap(([type, def]) =>
  def.items.map(item => ({ ...item, loanType: type, loanTypeLabel: def.label }))
);

function classifyFile(fileName, content) {
  const text = (fileName + " " + content).toLowerCase();
  let best = null, bestScore = 0;
  for (const item of ALL_ITEMS) {
    let score = 0;
    for (const kw of item.keywords) { if (text.includes(kw)) score++; }
    if (score > bestScore) { bestScore = score; best = item; }
  }
  return best && bestScore > 0 ? { ...best, confidence: Math.min(100, bestScore * 18) } : null;
}

function extractMeta(fileName, content) {
  const meta = {};
  const dateMatch = content.match(/\b(0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12]\d|3[01])[\/\-](20\d{2})\b/);
  if (dateMatch) meta.date = dateMatch[0];
  const dscrMatch = content.match(/(\d\.\d{2})x/i);
  if (dscrMatch) meta.dscr = dscrMatch[1] + "x";
  const amtMatch = content.match(/\$([\d,]+)/);
  if (amtMatch) meta.amount = "$" + amtMatch[1];
  return meta;
}

const fileIcon = (name) => {
  if (name.endsWith(".pdf")) return "📄";
  if (name.endsWith(".docx") || name.endsWith(".doc")) return "📝";
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return "📊";
  return "📁";
};
const formatBytes = (b) => b > 1048576 ? (b/1048576).toFixed(1)+" MB" : (b/1024).toFixed(0)+" KB";

const DEMO_FILES = [
  { name: "113_Ferry_Management_Annual_Review_2024.docx",  size: 48200,   content: "credit analysis annual review DSCR debt coverage ratio 1.57x Gerlando Vecchio Newark NJ mixed use" },
  { name: "McNerney_Appraisal_Ferry_St_Apr2022.pdf",       size: 2340000, content: "appraisal valuation income approach cap rate 5.93% appraised value $1,800,000 sales comp appraisal review Newark" },
  { name: "Vecchio_PFS_Jan2024.pdf",                       size: 142000,  content: "personal financial statement PFS net worth 50352 liquid assets 6650 total liabilities guarantor" },
  { name: "Ferry_IE_Statement_12312023.xlsx",               size: 38000,   content: "income expense I&E fiscal statement gross annual income real estate taxes total expenses net operating income balance sheet" },
  { name: "Vecchio_PTR_2023.pdf",                          size: 198000,  content: "personal tax return 1040 PTR AGI individual income tax 2023" },
  { name: "Loan_Approval_Committee_Apr2022.pdf",           size: 450000,  content: "loan approval committee presentation credit committee approval memo 04/04/2022" },
  { name: "RentRoll_Ferry_12312023.xlsx",                  size: 28000,   content: "rent roll tenant schedule lease schedule occupancy ground floor retail multifamily" },
  { name: "PaymentHistory_TTM_Ferry.pdf",                  size: 95000,   content: "payment history TTM as agreed account history 12 months delinquency outstanding" },
  { name: "UCC_Lien_Filing_Ferry.pdf",                     size: 45000,   content: "UCC filing lien security agreement collateral" },
  { name: "BankInspection_Jan2024.pdf",                    size: 32000,   content: "bank inspection site visit property inspection January 2024" },
  { name: "CovenantCompliance_2023.docx",                  size: 18000,   content: "covenant compliance minimum DSCR 1.25x actual 1.55x annually waiver amendment compliance statement" },
];

// ── Brand tokens ──────────────────────────────────────────────────────────────
const B = {
  orange:    "#E8622A",
  orangeHov: "#D4551F",
  oliveBg:   "#4A5240",   // top banner olive/dark green from site
  navBg:     "#FFFFFF",
  bodyBg:    "#F4F4F2",
  cardBg:    "#FFFFFF",
  border:    "#DDD9D3",
  text:      "#2C2C2C",
  textMid:   "#5A5A5A",
  textLight: "#8A8A8A",
  green:     "#2E7D4F",
  red:       "#C0392B",
  redBg:     "#FDF0EF",
  greenBg:   "#EFF7F2",
  amber:     "#B7640A",
};

export default function CEISDocIntel() {
  const [loanType, setLoanType]   = useState("CRE");
  const [files, setFiles]         = useState([]);
  const [docs, setDocs]           = useState([]);
  const [tab, setTab]             = useState("upload");
  const [processing, setProcessing] = useState(false);
  const [dragOver, setDragOver]   = useState(false);
  const fileInputRef = useRef();

  // Read a File object → plain text content
  const readFileContent = (file) => {
    return new Promise((resolve) => {
      const isExcel = file.name.endsWith(".xlsx") || file.name.endsWith(".xls") || file.name.endsWith(".csv");
      const isText  = file.name.endsWith(".txt")  || file.name.endsWith(".md");

      if (isExcel && file instanceof File) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const wb = XLSX.read(e.target.result, { type: "array" });
            // Extract all text from all sheets
            const text = wb.SheetNames.map(name => {
              const sheet = wb.Sheets[name];
              return XLSX.utils.sheet_to_csv(sheet);
            }).join("\n");
            resolve(text);
          } catch {
            resolve(file.name); // fallback to filename
          }
        };
        reader.onerror = () => resolve(file.name);
        reader.readAsArrayBuffer(file);
      } else if (isText && file instanceof File) {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result || file.name);
        reader.onerror = () => resolve(file.name);
        reader.readAsText(file);
      } else {
        // PDF / DOCX / demo objects — use pre-supplied content or filename
        resolve(file.content || file.name);
      }
    });
  };

  const analyze = async (rawFiles) => {
    setProcessing(true);
    const processed = await Promise.all(
      rawFiles.map(async (f) => {
        const content = await readFileContent(f);
        return {
          id: Math.random().toString(36).slice(2),
          name: f.name,
          size: f.size,
          cls:  classifyFile(f.name, content),
          meta: extractMeta(f.name, content),
          source: (f.name.endsWith(".xlsx") || f.name.endsWith(".xls")) ? "excel-parsed" : "filename",
        };
      })
    );
    setDocs(processed);
    setProcessing(false);
    setTab("report");
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (!dropped.length) return;
    setFiles(dropped);
    analyze(dropped);
  }, []);

  const handleSelect = (e) => {
    const sel = Array.from(e.target.files);
    if (!sel.length) return;
    setFiles(sel);
    analyze(sel);
  };

  const runDemo = () => { setFiles(DEMO_FILES); analyze(DEMO_FILES); };

  const inv = INVENTORY[loanType];
  const matchedIds = new Set(docs.filter(d => d.cls).map(d => d.cls.id));
  const inventoryStatus = inv.items.map(item => ({
    ...item, matched: matchedIds.has(item.id),
    matchedDoc: docs.find(d => d.cls?.id === item.id),
  }));
  const presentRequired  = inventoryStatus.filter(i => i.required && i.matched).length;
  const totalRequired    = inventoryStatus.filter(i => i.required).length;
  const exceptions       = inventoryStatus.filter(i => i.required && !i.matched);
  const completePct      = totalRequired > 0 ? Math.round((presentRequired / totalRequired) * 100) : 0;
  const unclassified     = docs.filter(d => !d.cls);

  const exceptionLevel = exceptions.length === 0 ? null
    : exceptions.length / totalRequired < 0.25 ? { label: "LOW",            color: B.amber  }
    : exceptions.length / totalRequired < 0.30 ? { label: "NORMAL / MEDIUM",color: B.amber  }
    : { label: "HIGH", color: B.red };

  const NavTab = ({ id, label, badge }) => {
    const active = tab === id;
    return (
      <button onClick={() => setTab(id)} style={{ padding: "8px 22px", background: active ? B.orange : "transparent", border: `1.5px solid ${active ? B.orange : B.border}`, borderRadius: "3px", color: active ? "#fff" : B.textMid, cursor: "pointer", fontSize: "12px", letterSpacing: "1.5px", fontFamily: "'Arial', sans-serif", fontWeight: active ? "700" : "400", transition: "all 0.15s", display: "flex", alignItems: "center", gap: "6px" }}>
        {label}
        {badge > 0 && <span style={{ background: active ? "rgba(255,255,255,0.3)" : B.red, color: "#fff", borderRadius: "10px", padding: "0 6px", fontSize: "10px", fontWeight: "700" }}>{badge}</span>}
      </button>
    );
  };

  return (
    <div style={{ fontFamily: "'Arial', 'Helvetica', sans-serif", background: B.bodyBg, minHeight: "100vh", color: B.text }}>

      {/* Olive top bar */}
      <div style={{ background: B.oliveBg, padding: "6px 32px", textAlign: "right" }}>
        <span style={{ fontSize: "11px", color: "#d4d9cc", letterSpacing: "0.5px" }}>Credit File Document Intelligence System</span>
      </div>

      {/* White nav bar */}
      <div style={{ background: B.navBg, borderBottom: `2px solid ${B.border}`, padding: "14px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          {/* CEIS logo recreation */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "32px", fontWeight: "900", color: B.orange, letterSpacing: "-1px", fontFamily: "'Arial Black', 'Arial', sans-serif" }}>ceis</span>
            <div style={{ width: "1px", height: "36px", background: B.border }} />
            <div style={{ lineHeight: "1.25" }}>
              <div style={{ fontSize: "10px", color: B.textMid, letterSpacing: "0.5px" }}>Critical Energy</div>
              <div style={{ fontSize: "10px", color: B.textMid, letterSpacing: "0.5px" }}>Infrastructure</div>
              <div style={{ fontSize: "10px", color: B.textMid, letterSpacing: "0.5px" }}>Services</div>
            </div>
          </div>
          <div style={{ width: "1px", height: "36px", background: B.border, marginLeft: "8px" }} />
          <div>
            <div style={{ fontSize: "11px", color: B.textLight, letterSpacing: "2px", textTransform: "uppercase" }}>Loan Review</div>
            <div style={{ fontSize: "16px", color: B.text, fontWeight: "600", letterSpacing: "0.2px" }}>Document Intelligence</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <NavTab id="upload"     label="UPLOAD" />
          <NavTab id="report"     label="REPORT" />
          <NavTab id="exceptions" label="EXCEPTIONS" badge={exceptions.length} />
        </div>
      </div>

      {/* Facility type bar */}
      <div style={{ background: "#EEEBE6", borderBottom: `1px solid ${B.border}`, padding: "10px 32px", display: "flex", gap: "6px", alignItems: "center" }}>
        <span style={{ fontSize: "11px", color: B.textLight, letterSpacing: "2px", marginRight: "10px", textTransform: "uppercase" }}>Facility Type:</span>
        {Object.entries(INVENTORY).map(([key, def]) => {
          const active = loanType === key;
          return (
            <button key={key} onClick={() => setLoanType(key)} style={{ padding: "5px 16px", background: active ? B.orange : "#fff", border: `1.5px solid ${active ? B.orange : B.border}`, borderRadius: "3px", color: active ? "#fff" : B.textMid, cursor: "pointer", fontSize: "12px", letterSpacing: "1px", fontWeight: active ? "700" : "400", transition: "all 0.15s" }}>
              {key}
            </button>
          );
        })}
        <span style={{ marginLeft: "auto", fontSize: "12px", color: B.textMid, fontStyle: "italic" }}>{inv.label}</span>
      </div>

      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "28px 24px" }}>

        {/* ── UPLOAD ── */}
        {tab === "upload" && (
          <div>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current.click()}
              style={{ border: `2px dashed ${dragOver ? B.orange : B.border}`, borderRadius: "6px", padding: "56px 32px", textAlign: "center", cursor: "pointer", background: dragOver ? "#FEF3EE" : "#fff", transition: "all 0.2s" }}
            >
              <div style={{ fontSize: "44px", marginBottom: "12px" }}>📂</div>
              <p style={{ fontSize: "18px", color: B.text, margin: "0 0 6px", fontWeight: "600" }}>Drop your loan package files here</p>
              <p style={{ fontSize: "13px", color: B.textLight, margin: "0 0 24px" }}>PDF · DOCX · XLSX · TXT — matched against the CEIS Credit File Inventory List</p>
              <div style={{ display: "inline-block", padding: "10px 28px", background: B.orange, borderRadius: "3px", color: "#fff", fontSize: "13px", letterSpacing: "1.5px", fontWeight: "700" }}>SELECT FILES</div>
              <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={handleSelect} />
            </div>

            {processing && (
              <div style={{ marginTop: "20px", background: "#fff", border: `1px solid ${B.border}`, borderRadius: "6px", padding: "20px", textAlign: "center" }}>
                <div style={{ fontSize: "13px", color: B.orange, letterSpacing: "1px", fontWeight: "600", marginBottom: "10px" }}>Classifying documents...</div>
                <div style={{ height: "4px", background: B.border, borderRadius: "2px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: "55%", background: B.orange, borderRadius: "2px", animation: "slide 1.2s ease-in-out infinite" }} />
                </div>
              </div>
            )}

            {!processing && files.length === 0 && (
              <div style={{ marginTop: "24px", textAlign: "center" }}>
                <div style={{ fontSize: "12px", color: B.textLight, letterSpacing: "1px", marginBottom: "14px" }}>— or load sample package —</div>
                <button onClick={runDemo} style={{ padding: "11px 32px", background: "#fff", border: `1.5px solid ${B.orange}`, borderRadius: "3px", color: B.orange, cursor: "pointer", fontSize: "13px", fontWeight: "600", letterSpacing: "0.5px", transition: "all 0.15s" }}>
                  Run Demo · 113 Ferry Management LLC
                </button>
              </div>
            )}

            {!processing && files.length > 0 && (
              <div style={{ marginTop: "20px" }}>
                <p style={{ fontSize: "12px", color: B.textLight, letterSpacing: "1px", marginBottom: "10px", textTransform: "uppercase" }}>Ingested Files — {files.length}</p>
                <div style={{ background: "#fff", border: `1px solid ${B.border}`, borderRadius: "6px", overflow: "hidden" }}>
                  {files.map((f, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "11px 16px", borderBottom: i < files.length - 1 ? `1px solid ${B.border}` : "none" }}>
                      <span>{fileIcon(f.name)}</span>
                      <span style={{ flex: 1, fontSize: "13px", color: B.text }}>{f.name}</span>
                      <span style={{ fontSize: "11px", color: B.textLight }}>{formatBytes(f.size)}</span>
                      <span style={{ fontSize: "11px", color: B.green, fontWeight: "600" }}>✓ Ingested</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => setTab("report")} style={{ marginTop: "14px", width: "100%", padding: "13px", background: B.orange, border: "none", borderRadius: "4px", color: "#fff", fontSize: "13px", fontWeight: "700", letterSpacing: "1px", cursor: "pointer" }}>
                  View Analysis Report →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── REPORT ── */}
        {tab === "report" && (
          docs.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px", background: "#fff", borderRadius: "6px", border: `1px solid ${B.border}` }}>
              <div style={{ fontSize: "36px", marginBottom: "12px", opacity: 0.3 }}>📋</div>
              <div style={{ color: B.textLight, fontSize: "14px" }}>No files loaded yet</div>
              <button onClick={() => setTab("upload")} style={{ marginTop: "14px", padding: "10px 24px", background: B.orange, border: "none", borderRadius: "3px", color: "#fff", cursor: "pointer", fontSize: "12px", fontWeight: "600" }}>Go to Upload</button>
            </div>
          ) : (
            <div>
              {/* Metric cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "14px", marginBottom: "24px" }}>
                {[
                  { label: "Files Ingested",     value: files.length,                                        accent: B.orange },
                  { label: "Classified",          value: docs.filter(d=>d.cls).length,                       accent: B.green  },
                  { label: "Inventory Matched",   value: `${inventoryStatus.filter(i=>i.matched).length}/${inv.items.length}`, accent: B.oliveBg },
                  { label: "Exceptions (E)",      value: exceptions.length, accent: exceptions.length > 0 ? B.red : B.green },
                ].map(c => (
                  <div key={c.label} style={{ background: "#fff", border: `1px solid ${B.border}`, borderRadius: "6px", padding: "18px 20px", borderLeft: `4px solid ${c.accent}` }}>
                    <div style={{ fontSize: "30px", color: c.accent, fontWeight: "700", marginBottom: "4px" }}>{c.value}</div>
                    <div style={{ fontSize: "11px", color: B.textLight, letterSpacing: "1px", textTransform: "uppercase" }}>{c.label}</div>
                  </div>
                ))}
              </div>

              {/* Completeness bar */}
              <div style={{ background: "#fff", border: `1px solid ${B.border}`, borderRadius: "6px", padding: "18px 20px", marginBottom: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ fontSize: "12px", color: B.textMid, fontWeight: "600", textTransform: "uppercase", letterSpacing: "1px" }}>Required Document Completeness — {loanType}</span>
                  <span style={{ fontSize: "16px", color: completePct === 100 ? B.green : B.orange, fontWeight: "700" }}>{completePct}%</span>
                </div>
                <div style={{ height: "8px", background: B.border, borderRadius: "4px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: completePct+"%", background: completePct===100 ? B.green : completePct>=70 ? B.orange : B.red, borderRadius: "4px", transition: "width 0.8s ease" }} />
                </div>
                <div style={{ display: "flex", gap: "20px", marginTop: "8px", fontSize: "12px" }}>
                  <span style={{ color: B.green, fontWeight: "600" }}>✓ Present: {presentRequired}</span>
                  <span style={{ color: B.red, fontWeight: "600" }}>✗ Missing: {totalRequired - presentRequired}</span>
                  <span style={{ color: B.textLight }}>Total Required: {totalRequired}</span>
                  {unclassified.length > 0 && <span style={{ color: B.amber, fontWeight: "600" }}>⚠ Unclassified: {unclassified.length}</span>}
                </div>
              </div>

              {/* Classification Table */}
              <p style={{ fontSize: "12px", color: B.textLight, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "10px" }}>Document Classification</p>
              <div style={{ background: "#fff", border: `1px solid ${B.border}`, borderRadius: "6px", overflow: "hidden", marginBottom: "24px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#F8F6F3", borderBottom: `1px solid ${B.border}` }}>
                      {["File", "Matched To", "Type", "Confidence", "Key Data"].map(h => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: "11px", color: B.textLight, letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: "600" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {docs.map((doc, i) => (
                      <tr key={doc.id} style={{ borderBottom: i < docs.length-1 ? `1px solid ${B.border}` : "none" }}>
                        <td style={{ padding: "10px 14px", fontSize: "12px", color: B.text, maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={doc.name}>
                          {fileIcon(doc.name)} {doc.name}
                        </td>
                        <td style={{ padding: "10px 14px", fontSize: "12px" }}>
                          {doc.cls ? <span style={{ color: B.green, fontWeight: "600" }}>{doc.cls.label}</span>
                                   : <span style={{ color: B.red, fontSize: "11px", fontWeight: "600" }}>UNCLASSIFIED</span>}
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                            {doc.cls && <span style={{ background: "#FEF3EE", color: B.orange, padding: "2px 8px", borderRadius: "3px", fontSize: "11px", fontWeight: "600", display: "inline-block" }}>{doc.cls.loanType}</span>}
                            {doc.source === "excel-parsed" && <span style={{ background: "#EFF7F2", color: B.green, padding: "2px 8px", borderRadius: "3px", fontSize: "10px", fontWeight: "600", display: "inline-block" }}>📊 content parsed</span>}
                          </div>
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          {doc.cls && (
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <div style={{ width: "52px", height: "5px", background: B.border, borderRadius: "3px", overflow: "hidden" }}>
                                <div style={{ width: doc.cls.confidence+"%", height: "100%", background: doc.cls.confidence>=70 ? B.green : doc.cls.confidence>=40 ? B.orange : B.red }} />
                              </div>
                              <span style={{ fontSize: "11px", color: B.textLight }}>{doc.cls.confidence}%</span>
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "10px 14px", fontSize: "11px", color: B.orange, fontWeight: "600" }}>
                          {Object.entries(doc.meta).map(([k,v]) => `${k}: ${v}`).join(" · ") || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Inventory Checklist */}
              <p style={{ fontSize: "12px", color: B.textLight, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "10px" }}>CEIS Inventory Checklist — {loanType}</p>
              <div style={{ background: "#fff", border: `1px solid ${B.border}`, borderRadius: "6px", overflow: "hidden" }}>
                {inventoryStatus.map((item, i) => (
                  <div key={item.id} style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "12px 16px", borderBottom: i < inventoryStatus.length-1 ? `1px solid ${B.border}` : "none", background: item.required && !item.matched ? B.redBg : "transparent" }}>
                    <div style={{ width: "10px", height: "10px", borderRadius: "50%", marginTop: "4px", background: item.matched ? B.green : item.required ? B.red : B.border, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "13px", color: item.matched ? B.text : item.required ? B.textMid : B.textLight, fontWeight: item.required ? "500" : "400" }}>{item.label}</span>
                        {item.required && !item.matched && (
                          <span style={{ fontSize: "10px", background: B.red, color: "#fff", padding: "1px 7px", borderRadius: "3px", fontWeight: "700", letterSpacing: "0.5px" }}>E — EXCEPTION</span>
                        )}
                        {!item.required && <span style={{ fontSize: "10px", color: B.textLight, fontStyle: "italic" }}>optional</span>}
                      </div>
                      {item.matchedDoc && (
                        <div style={{ fontSize: "11px", color: B.green, marginTop: "3px" }}>
                          ↳ {item.matchedDoc.name}
                          {Object.keys(item.matchedDoc.meta).length > 0 && (
                            <span style={{ color: B.orange, marginLeft: "8px" }}>
                              {Object.entries(item.matchedDoc.meta).map(([k,v]) => `${k}: ${v}`).join(" · ")}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: "11px", fontWeight: "700", color: item.matched ? B.green : item.required ? B.red : B.textLight, flexShrink: 0 }}>
                      {item.matched ? "PRESENT" : "MISSING"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        )}

        {/* ── EXCEPTIONS ── */}
        {tab === "exceptions" && (
          docs.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px", background: "#fff", borderRadius: "6px", border: `1px solid ${B.border}` }}>
              <div style={{ fontSize: "36px", opacity: 0.3, marginBottom: "12px" }}>⚠️</div>
              <div style={{ color: B.textLight }}>No files loaded yet</div>
              <button onClick={() => setTab("upload")} style={{ marginTop: "14px", padding: "10px 24px", background: B.orange, border: "none", borderRadius: "3px", color: "#fff", cursor: "pointer", fontSize: "12px", fontWeight: "600" }}>Go to Upload</button>
            </div>
          ) : (
            <div>
              {/* Header */}
              <div style={{ background: "#fff", border: `1px solid ${B.border}`, borderRadius: "6px", padding: "20px 24px", marginBottom: "20px", display: "flex", alignItems: "flex-start", gap: "16px" }}>
                <div style={{ width: "4px", height: "100%", minHeight: "40px", background: exceptionLevel?.color || B.green, borderRadius: "2px", flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "16px", fontWeight: "700", color: B.text, marginBottom: "4px" }}>Exception & Completeness Report</div>
                  <div style={{ fontSize: "12px", color: B.textLight, marginBottom: "10px" }}>{loanType} — {inv.label} · {files.length} files analyzed</div>
                  <p style={{ margin: 0, fontSize: "12px", color: B.textMid, lineHeight: "1.7" }}>
                    Per CEIS Standard Guidance, required documents absent from the loan package are cited as <strong style={{ color: B.red }}>Exceptions (E)</strong>. Exceptions must be communicated to the Bank daily. Report exception levels as <strong>Low / Normal-Medium / High</strong> — do not quote exact percentages.
                  </p>
                </div>
                {exceptionLevel && (
                  <div style={{ padding: "6px 16px", background: exceptionLevel.color === B.red ? B.redBg : "#FFF8EE", border: `1.5px solid ${exceptionLevel.color}`, borderRadius: "4px", color: exceptionLevel.color, fontSize: "12px", fontWeight: "700", flexShrink: 0 }}>
                    {exceptionLevel.label}
                  </div>
                )}
              </div>

              {exceptions.length === 0 ? (
                <div style={{ textAlign: "center", padding: "48px", background: B.greenBg, borderRadius: "6px", border: `1px solid #b2d8c4` }}>
                  <div style={{ fontSize: "36px", marginBottom: "10px" }}>✅</div>
                  <div style={{ fontSize: "16px", color: B.green, fontWeight: "700", marginBottom: "6px" }}>No Exceptions</div>
                  <div style={{ fontSize: "13px", color: B.textMid }}>All required {loanType} documents are present in the package.</div>
                </div>
              ) : (
                <div style={{ display: "grid", gap: "10px", marginBottom: "24px" }}>
                  {exceptions.map((exc) => (
                    <div key={exc.id} style={{ display: "flex", gap: "14px", padding: "16px 18px", background: B.redBg, border: `1px solid #E8B4B0`, borderRadius: "6px", alignItems: "flex-start" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "28px", height: "28px", background: B.red, borderRadius: "4px", flexShrink: 0 }}>
                        <span style={{ color: "#fff", fontSize: "13px", fontWeight: "900" }}>E</span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "13px", color: B.text, fontWeight: "600", marginBottom: "3px" }}>{exc.label}</div>
                        <div style={{ fontSize: "11px", color: B.textLight }}>Loan Type: {loanType} · Required: Yes · Status: Not in file</div>
                      </div>
                      <span style={{ fontSize: "11px", color: B.red, fontWeight: "700", flexShrink: 0 }}>MISSING</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Two-col summary */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div style={{ background: "#fff", border: `1px solid ${B.border}`, borderRadius: "6px", padding: "16px 18px" }}>
                  <p style={{ fontSize: "11px", color: B.green, fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", margin: "0 0 12px" }}>Present in File</p>
                  {inventoryStatus.filter(i=>i.matched).length === 0
                    ? <div style={{ fontSize: "12px", color: B.textLight, fontStyle: "italic" }}>None matched</div>
                    : inventoryStatus.filter(i=>i.matched).map(item => (
                      <div key={item.id} style={{ fontSize: "12px", color: B.textMid, padding: "5px 0", borderBottom: `1px solid ${B.border}`, display: "flex", gap: "8px" }}>
                        <span style={{ color: B.green, fontWeight: "700" }}>✓</span> {item.label}
                      </div>
                    ))
                  }
                </div>
                <div style={{ background: "#fff", border: `1px solid ${B.border}`, borderRadius: "6px", padding: "16px 18px" }}>
                  <p style={{ fontSize: "11px", color: B.red, fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", margin: "0 0 12px" }}>Not in File</p>
                  {inventoryStatus.filter(i=>!i.matched).map(item => (
                    <div key={item.id} style={{ fontSize: "12px", color: B.textMid, padding: "5px 0", borderBottom: `1px solid ${B.border}`, display: "flex", gap: "8px", alignItems: "center" }}>
                      <span style={{ color: item.required ? B.red : B.textLight, fontWeight: "700" }}>{item.required ? "✗" : "○"}</span>
                      <span style={{ flex: 1 }}>{item.label}</span>
                      {item.required && <span style={{ fontSize: "10px", background: B.red, color: "#fff", padding: "1px 6px", borderRadius: "3px", fontWeight: "700", flexShrink: 0 }}>E</span>}
                    </div>
                  ))}
                </div>
              </div>

              {unclassified.length > 0 && (
                <div style={{ marginTop: "16px", background: "#FFFBF0", border: `1px solid #F0D080`, borderRadius: "6px", padding: "16px 18px" }}>
                  <p style={{ fontSize: "11px", color: B.amber, fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", margin: "0 0 10px" }}>⚠ Unclassified Files — Manual Review Required</p>
                  {unclassified.map(doc => (
                    <div key={doc.id} style={{ fontSize: "12px", color: B.textMid, padding: "3px 0" }}>{fileIcon(doc.name)} {doc.name}</div>
                  ))}
                </div>
              )}
            </div>
          )
        )}
      </div>

      {/* Footer */}
      <div style={{ background: B.oliveBg, marginTop: "48px", padding: "16px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "12px", color: "#c8cdc2" }}>© CEIS — Critical Energy Infrastructure Services</span>
        <span style={{ fontSize: "11px", color: "#8a9080", letterSpacing: "1px" }}>DOCUMENT INTELLIGENCE SYSTEM</span>
      </div>

      <style>{`@keyframes slide { 0%{transform:translateX(-100%)} 100%{transform:translateX(280%)} }`}</style>
    </div>
  );
}
