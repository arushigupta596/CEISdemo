import { useState, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import * as pdfjsLib from "pdfjs-dist";
import { createWorker } from "tesseract.js";
import mammoth from "mammoth";

// Point PDF.js to its worker bundle
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.js",
  import.meta.url
).toString();

// ── Keyword weights ────────────────────────────────────────────────────────
// W3 = highly specific / near-unique to this document type (e.g. "rent roll", "1040")
// W2 = domain-specific but shared across a few types  (e.g. "appraisal", "covenant")
// W1 = generic financial terms present in many docs   (e.g. "income", "balance sheet")
const W3 = 3;  // anchor term  — this word almost only appears in this doc type
const W2 = 2;  // strong term  — meaningfully associated but not unique
const W1 = 1;  // weak term    — supporting signal, adds confidence if others match

// Each keyword entry is [term, weight]
const INVENTORY = {
  CRE: {
    label: "Commercial Real Estate (CRE)",
    color: "#1B6CB5",
    items: [
      { id: "cre_account_history", label: "Borrower Account History (outstanding, payments, delinquencies)", required: true, keywords: [
        ["account history",W3], ["payment history",W3], ["pay history",W3], ["loan history",W2],
        ["delinquency",W2], ["delinquencies",W2], ["ttm",W2], ["as agreed",W2], ["outstanding balance",W1],
      ]},
      { id: "cre_credit_proposal", label: "Original & Latest Bank Credit Proposal / Credit Analysis / Annual Review", required: true, keywords: [
        ["annual review",W3], ["credit analysis",W3], ["credit proposal",W3], ["uw memo",W3],
        ["credit memo",W2], ["underwriting memo",W2], ["underwriting",W1],
      ]},
      { id: "cre_committee", label: "Latest Bank Credit Committee Approval", required: true, keywords: [
        ["credit committee",W3], ["committee approval",W3], ["loan committee",W3],
        ["loan approval",W2], ["approval memo",W2], ["committee presentation",W2],
      ]},
      { id: "cre_fin_statements", label: "Last 3 Years Financial Statements – Borrower (I&E, CTR, management accounts)", required: true, keywords: [
        ["i&e",W3], ["income & expense",W3], ["income expense",W3], ["management accounts",W3],
        ["financial statement",W2], ["profit loss",W2], ["p&l",W2], ["ctr",W2],
        ["balance sheet",W1], ["fiscal",W1], ["net operating income",W1],
      ]},
      { id: "cre_guarantor_fin", label: "Guarantor Financials (PFS, PTR, etc.)", required: true, keywords: [
        ["personal financial statement",W3], ["pfs",W3], ["ptr",W3], ["net worth statement",W3],
        ["guarantor",W2], ["personal tax return",W2], ["liquid assets",W2],
        ["total liabilities",W1], ["adjusted net worth",W1],
      ]},
      { id: "cre_appraisal", label: "Latest Property Appraisal & Appraisal Review", required: true, keywords: [
        ["appraisal",W3], ["appraised value",W3], ["cap rate",W3], ["income approach",W3],
        ["sales comp",W3], ["appraisal review",W3], ["as is value",W2],
        ["valuation",W2], ["as stabilized",W2], ["mcnerney",W2], ["cushman",W2], ["cbre",W2],
        ["capitalization rate",W1],
      ]},
      { id: "cre_bank_inspection", label: "Latest Bank Inspection / Site Visit", required: true, keywords: [
        ["bank inspection",W3], ["site visit",W3], ["property inspection",W3],
        ["inspection report",W2], ["site inspection",W2],
        ["inspection",W1],
      ]},
      { id: "cre_rent_roll", label: "Latest Rent Roll", required: true, keywords: [
        ["rent roll",W3], ["tenant schedule",W3], ["lease schedule",W3],
        ["tenant list",W2], ["lease expiry",W2], ["annual rent",W2], ["occupancy",W2],
        ["tenancy",W1], ["sq ft",W1], ["square feet",W1],
      ]},
      { id: "cre_third_party", label: "Third-Party Rating Inputs", required: false, keywords: [
        ["third party rating",W3], ["risk rating input",W3],
        ["rating agency",W2], ["third-party report",W2],
      ]},
      { id: "cre_covenant", label: "Covenant Compliance Statement / Waivers / Amendments", required: false, keywords: [
        ["covenant compliance",W3], ["compliance certificate",W3], ["dscr covenant",W3],
        ["compliance statement",W2], ["covenant waiver",W2], ["covenant amendment",W2],
        ["waiver",W1], ["amendment",W1], ["minimum dscr",W1],
      ]},
    ],
  },
  CI: {
    label: "Commercial & Industrial (C&I)",
    color: "#1B6CB5",
    items: [
      { id: "ci_account_history", label: "Borrower Account History (outstanding, payments, delinquencies)", required: true, keywords: [
        ["account history",W3], ["payment history",W3], ["pay history",W3],
        ["delinquency",W2], ["ttm",W2], ["as agreed",W2], ["loan history",W2],
        ["outstanding",W1],
      ]},
      { id: "ci_credit_proposal", label: "Original & Latest Bank Credit Proposal / Annual Review", required: true, keywords: [
        ["annual review",W3], ["credit analysis",W3], ["credit proposal",W3],
        ["uw memo",W3], ["credit memo",W2], ["underwriting",W1],
      ]},
      { id: "ci_committee", label: "Latest Credit Committee Approval", required: true, keywords: [
        ["credit committee",W3], ["committee approval",W3],
        ["loan approval",W2], ["approval memo",W2],
      ]},
      { id: "ci_collateral_val", label: "Most Recent Collateral Valuation(s)", required: true, keywords: [
        ["collateral valuation",W3], ["equipment appraisal",W3], ["inventory valuation",W3],
        ["collateral value",W2], ["ucc",W2], ["lien search",W2],
        ["collateral",W1],
      ]},
      { id: "ci_abl_docs", label: "Field Audit / Receivable Aging / Borrowing Base Certificate (if ABL)", required: false, keywords: [
        ["field audit",W3], ["receivable aging",W3], ["borrowing base certificate",W3], ["bbc",W3],
        ["a/r aging",W2], ["accounts receivable aging",W2], ["abl",W2], ["borrowing base",W2],
        ["availability",W1],
      ]},
      { id: "ci_projections", label: "Financial Projections / Budgets", required: false, keywords: [
        ["financial projections",W3], ["cash flow projection",W3], ["pro forma",W3],
        ["budget",W2], ["proforma",W2], ["forecast",W2],
        ["projection",W1],
      ]},
      { id: "ci_fin_statements", label: "Last 3 Years Fiscal Financials + Interim Statements (10K, 10Q, CTR)", required: true, keywords: [
        ["10-k",W3], ["10k",W3], ["10-q",W3], ["10q",W3], ["audited financial",W3],
        ["financial statement",W2], ["interim statement",W2], ["ctr",W2],
        ["balance sheet",W1], ["income",W1], ["fiscal",W1],
      ]},
      { id: "ci_covenant", label: "Covenant Compliance Statement / Waivers / Amendments", required: false, keywords: [
        ["covenant compliance",W3], ["compliance certificate",W3],
        ["compliance statement",W2], ["waiver",W2], ["amendment",W1],
      ]},
      { id: "ci_third_party", label: "Third-Party Rating Inputs", required: false, keywords: [
        ["third party rating",W3], ["risk rating input",W3], ["rating agency",W2],
      ]},
      { id: "ci_info_memo", label: "Information Memorandum (syndicated deals, past 24 months)", required: false, keywords: [
        ["information memorandum",W3], ["syndicated loan",W3], ["info memo",W3],
        ["syndicated",W2], ["lead arranger",W2],
      ]},
    ],
  },
  Resi: {
    label: "Residential (Resi)",
    color: "#1B6CB5",
    items: [
      { id: "resi_account_history", label: "Borrower Account History (outstanding, payments, delinquencies)", required: true, keywords: [
        ["payment history",W3], ["account history",W3], ["mortgage history",W3],
        ["delinquency",W2], ["ttm",W2], ["as agreed",W2],
      ]},
      { id: "resi_credit_proposal", label: "Original & Latest Bank Credit Proposal / Annual Review", required: true, keywords: [
        ["credit proposal",W3], ["annual review",W3], ["credit analysis",W3],
        ["underwriting",W2], ["uw memo",W2],
      ]},
      { id: "resi_committee", label: "Latest Bank Credit Committee Approval", required: true, keywords: [
        ["credit committee",W3], ["committee approval",W3], ["loan approval",W2], ["approval memo",W2],
      ]},
      { id: "resi_fin_statements", label: "Last 3 Years Financial Statements – Borrower", required: true, keywords: [
        ["financial statement",W2], ["income statement",W2], ["p&l",W2],
        ["balance sheet",W1], ["fiscal",W1],
      ]},
      { id: "resi_tax_returns", label: "Last 3 Years Tax Returns – Borrower", required: true, keywords: [
        ["form 1040",W3], ["1040",W3], ["personal tax return",W3], ["ptr",W3],
        ["agi",W2], ["adjusted gross income",W2], ["tax return",W2],
        ["individual tax",W1],
      ]},
      { id: "resi_credit_reports", label: "Credit Reports", required: true, keywords: [
        ["credit report",W3], ["fico score",W3], ["tri-merge",W3], ["credit score",W3],
        ["equifax",W2], ["experian",W2], ["transunion",W2],
        ["fico",W1],
      ]},
      { id: "resi_note_title", label: "Note and Title", required: true, keywords: [
        ["promissory note",W3], ["deed of trust",W3], ["title insurance",W3], ["title commitment",W3],
        ["mortgage note",W2], ["title search",W2],
        ["note date",W1], ["title",W1],
      ]},
      { id: "resi_appraisal", label: "Latest Appraisal", required: true, keywords: [
        ["urar",W3], ["form 1004",W3], ["residential appraisal",W3], ["fnma appraisal",W3],
        ["appraised value",W2], ["appraisal",W2], ["as is value",W2],
        ["valuation",W1],
      ]},
      { id: "resi_closing_docs", label: "Closing Documents and Checklist", required: true, keywords: [
        ["closing disclosure",W3], ["hud-1",W3], ["settlement statement",W3], ["closing checklist",W3],
        ["closing documents",W2], ["cd form",W2],
        ["closing",W1], ["settlement",W1],
      ]},
      { id: "resi_legal_docs", label: "All Legal Documents", required: true, keywords: [
        ["security instrument",W3], ["legal document",W3],
        ["mortgage deed",W2], ["deed",W2], ["lien",W2],
        ["legal",W1],
      ]},
      { id: "resi_income_verify", label: "Verification of Income", required: true, keywords: [
        ["verification of income",W3], ["voe",W3], ["w-2",W3], ["paystub",W3],
        ["pay stub",W2], ["employment verification",W2], ["income verification",W2],
        ["salary",W1], ["wages",W1],
      ]},
      { id: "resi_liquidity_verify", label: "Verification of Liquidity", required: true, keywords: [
        ["verification of deposit",W3], ["vod",W3], ["asset verification",W3],
        ["bank statement",W2], ["liquid assets",W2], ["funds to close",W2],
        ["liquidity",W1],
      ]},
      { id: "resi_re_taxes", label: "Real Estate Tax / Insurance / Maintenance (subject + OREO)", required: true, keywords: [
        ["real estate tax",W3], ["hazard insurance",W3], ["property tax bill",W3],
        ["property tax",W2], ["homeowners insurance",W2], ["oreo",W2],
        ["insurance",W1], ["maintenance",W1],
      ]},
      { id: "resi_condo", label: "Condo Approval Information (if applicable)", required: false, keywords: [
        ["condo questionnaire",W3], ["hoa approval",W3], ["condominium rider",W3],
        ["hoa",W2], ["homeowners association",W2], ["condo",W2],
      ]},
      { id: "resi_application", label: "Signed Application", required: true, keywords: [
        ["urla",W3], ["form 1003",W3], ["uniform residential loan application",W3],
        ["signed application",W2], ["loan application",W2], ["1003",W2],
        ["application",W1],
      ]},
      { id: "resi_appraisal_review", label: "Appraisal Review", required: true, keywords: [
        ["appraisal review",W3], ["desk review",W3], ["field review",W3], ["amc review",W3],
        ["review appraisal",W2],
      ]},
      { id: "resi_business_returns", label: "3 Years Business Returns (if applicable)", required: false, keywords: [
        ["form 1120",W3], ["form 1065",W3], ["business tax return",W3],
        ["schedule c",W2], ["corporate return",W2],
        ["business return",W1],
      ]},
      { id: "resi_leases", label: "Leases on OREO (if needed)", required: false, keywords: [
        ["oreo lease",W3], ["lease agreement",W2], ["rental agreement",W2],
        ["lease",W1],
      ]},
    ],
  },
  Leveraged: {
    label: "Leveraged Loan",
    color: "#1B6CB5",
    items: [
      { id: "lev_account_history", label: "Borrower Account History (outstanding, payments, delinquencies)", required: true, keywords: [
        ["account history",W3], ["payment history",W3], ["pay history",W3],
        ["delinquency",W2], ["ttm",W2], ["as agreed",W2],
      ]},
      { id: "lev_credit_proposal", label: "Original & Latest Bank Credit Proposal / Annual Review", required: true, keywords: [
        ["annual review",W3], ["credit analysis",W3], ["credit proposal",W3],
        ["uw memo",W3], ["credit memo",W2], ["underwriting",W1],
      ]},
      { id: "lev_committee", label: "Latest Credit Committee Approval", required: true, keywords: [
        ["credit committee",W3], ["committee approval",W3],
        ["loan approval",W2], ["approval memo",W2],
      ]},
      { id: "lev_collateral_val", label: "Recent Collateral Valuations", required: false, keywords: [
        ["collateral valuation",W3], ["enterprise value",W3],
        ["equipment appraisal",W2], ["collateral value",W2],
      ]},
      { id: "lev_abl_docs", label: "Field Audit / Receivable Aging / Borrowing Base Certificate (if ABL)", required: false, keywords: [
        ["field audit",W3], ["borrowing base certificate",W3], ["bbc",W3],
        ["receivable aging",W2], ["abl",W2], ["borrowing base",W2],
      ]},
      { id: "lev_projections", label: "Financial Projections / Budgets", required: false, keywords: [
        ["financial projections",W3], ["pro forma",W3], ["lbo model",W3],
        ["budget",W2], ["forecast",W2], ["proforma",W1],
      ]},
      { id: "lev_fin_statements", label: "Last 3 Years Financial Statements (Annual + Interim, 10K, 10Q, CTR)", required: true, keywords: [
        ["audited financial",W3], ["10-k",W3], ["10k",W3], ["10-q",W3],
        ["financial statement",W2], ["interim statement",W2], ["ctr",W2],
        ["balance sheet",W1], ["fiscal",W1],
      ]},
      { id: "lev_covenant", label: "Covenant Compliance Statement / Global Debt Service", required: true, keywords: [
        ["global debt service",W3], ["gdscr",W3], ["leverage covenant",W3],
        ["covenant compliance",W2], ["compliance certificate",W2],
        ["waiver",W1], ["amendment",W1],
      ]},
      { id: "lev_third_party", label: "Third-Party Rating Inputs", required: false, keywords: [
        ["third party rating",W3], ["moody",W3], ["s&p rating",W3],
        ["rating agency",W2], ["credit rating",W2],
      ]},
      { id: "lev_info_memo", label: "Information Memorandum (syndicated, past 24 months)", required: false, keywords: [
        ["information memorandum",W3], ["confidential information memorandum",W3], ["cim",W3],
        ["syndicated",W2], ["lead arranger",W2], ["info memo",W2],
      ]},
      { id: "lev_quarterly_stmts", label: "Quarterly Financial Statements", required: true, keywords: [
        ["quarterly financial statement",W3], ["quarterly financials",W3], ["10-q",W3],
        ["quarterly statement",W2], ["q1",W2], ["q2",W2], ["q3",W2], ["q4",W2],
        ["quarterly",W1],
      ]},
      { id: "lev_quarterly_analysis", label: "Quarterly Bank Financial Analysis", required: true, keywords: [
        ["quarterly bank analysis",W3], ["quarterly credit review",W3],
        ["quarterly analysis",W2], ["quarterly review",W2], ["bank analysis",W2],
      ]},
    ],
  },
};

const ALL_ITEMS = Object.entries(INVENTORY).flatMap(([type, def]) =>
  def.items.map(item => ({ ...item, loanType: type, loanTypeLabel: def.label }))
);

// ── Weighted scoring engine ──────────────────────────────────────────────────
// Scoring rules:
//   1. Filename matches get 2x weight boost (filenames are intentional labels)
//   2. Phrase length bonus: longer phrases are more specific (up to +50%)
//   3. Ambiguity penalty: if runner-up is close, confidence is reduced
//   4. Anchor-only confidence floor: at least one W3 hit required for High
//   5. Normalised to 0-100 against item's theoretical max score
function classifyFile(fileName, content) {
  const fileText = fileName.toLowerCase();
  const bodyText = content.toLowerCase();

  const scores = ALL_ITEMS.map(item => {
    let score = 0;
    let anchorHits = 0;

    for (const [kw, weight] of item.keywords) {
      const inFile = fileText.includes(kw);
      const inBody = bodyText.includes(kw);
      if (!inFile && !inBody) continue;

      // Phrase length bonus: each extra word beyond the first adds 25% (max 50%)
      const wordCount = kw.trim().split(/\s+/).length;
      const lengthBonus = Math.min(1.5, 1 + (wordCount - 1) * 0.25);

      // Filename hits count double — filenames are deliberate, high-signal labels
      const locationMultiplier = inFile ? 2.0 : 1.0;

      score += weight * lengthBonus * locationMultiplier;
      if (weight === W3) anchorHits++;
    }

    return { item, score, anchorHits };
  }).filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score || b.anchorHits - a.anchorHits);

  if (scores.length === 0) return null;

  const { item: best, score: bestScore, anchorHits } = scores[0];

  // Theoretical max = sum of all weights × max phrase bonus (1.5) × filename boost (2.0)
  // Use a practical max: sum of W3 weights × 1.5 length bonus (typical best case)
  const practicalMax = best.keywords.reduce((sum, [kw, w]) => {
    const words = kw.trim().split(/\s+/).length;
    return sum + w * Math.min(1.5, 1 + (words - 1) * 0.25) * 2.0;
  }, 0);

  let confidence = Math.min(100, Math.round((bestScore / practicalMax) * 100));

  // Ambiguity penalty: if runner-up scored within 30% of winner, reduce confidence
  if (scores.length > 1) {
    const runnerScore = scores[1].score;
    const gap = (bestScore - runnerScore) / bestScore;
    if (gap < 0.30) {
      // Scale down: a gap of 0% → halve confidence; 30% gap → no penalty
      const penalty = Math.round((0.30 - gap) / 0.30 * 30);
      confidence = Math.max(10, confidence - penalty);
    }
  }

  // Must have at least one anchor (W3) hit to be rated High
  if (anchorHits === 0 && confidence > 55) confidence = 55;

  const confidenceLabel = confidence >= 75 ? "High" : confidence >= 45 ? "Medium" : "Low";

  return {
    ...best, confidence, confidenceLabel,
    rawScore: Math.round(bestScore),
    anchorHits,
    runnerUp: scores[1] ? scores[1].item.label : null,
  };
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

// ── CEIS Template Field Definitions ─────────────────────────────────────────
// Each doc type has a list of required fields. Each field has:
//   label       — human-readable name shown in disparity report
//   patterns    — regex/string patterns to detect presence in extracted text
//   required    — whether absence is a disparity (vs. advisory)
const TEMPLATE_FIELDS = {
  // Annual Review / Credit Analysis
  cre_credit_proposal: [
    { label: "Borrower Name",            required: true,  patterns: ["borrower"] },
    { label: "Loan Number",              required: true,  patterns: ["loan #", "loan number", "loan no"] },
    { label: "Outstanding Balance",      required: true,  patterns: ["outstanding", "book balance", "balance"] },
    { label: "Purpose",                  required: true,  patterns: ["purpose", "acquisition", "refinance", "equity recapture"] },
    { label: "Note Date",                required: true,  patterns: ["note date", "origination date"] },
    { label: "Maturity Date",            required: true,  patterns: ["maturity", "maturity date"] },
    { label: "Current Rate",             required: true,  patterns: ["current rate", "interest rate", "wsjp", "prime", "fixed rate", "% fixed", "% floating"] },
    { label: "Amortization",             required: true,  patterns: ["amortization", "i/o", "term/amo", "amort"] },
    { label: "Pay History (TTM)",        required: true,  patterns: ["pay history", "payment history", "ttm", "as agreed", "delinquency"] },
    { label: "Risk / Credit Grade",      required: true,  patterns: ["risk grade", "credit grade", "grade", "rating", "pass", "special mention", "substandard", "doubtful"] },
    { label: "DSCR / Debt Service Coverage", required: true, patterns: ["dscr", "debt service coverage", "debt coverage", "dsc"] },
    { label: "LTV",                      required: true,  patterns: ["ltv", "loan to value", "loan-to-value"] },
    { label: "NOI / Net Operating Income", required: false, patterns: ["noi", "net operating income"] },
    { label: "Guarantor Information",    required: true,  patterns: ["guarantor", "recourse", "personal guarantee"] },
    { label: "Collateral Description",   required: true,  patterns: ["collateral", "property", "security"] },
    { label: "Covenant Compliance",      required: false, patterns: ["covenant", "compliance", "minimum dscr", "financial covenant"] },
    { label: "Analysis / Commentary",    required: true,  patterns: ["analysis", "comment", "discussion", "narrative"] },
    { label: "Recommendation / Conclusion", required: true, patterns: ["recommend", "conclusion", "concur", "approve"] },
  ],
  ci_credit_proposal: [
    { label: "Borrower Name",            required: true,  patterns: ["borrower"] },
    { label: "Loan Number",              required: true,  patterns: ["loan #", "loan number", "loan no"] },
    { label: "Outstanding Balance",      required: true,  patterns: ["outstanding", "book balance", "balance"] },
    { label: "Purpose",                  required: true,  patterns: ["purpose", "working capital", "equipment", "acquisition"] },
    { label: "Current Rate",             required: true,  patterns: ["current rate", "interest rate", "prime", "sofr", "% fixed"] },
    { label: "Pay History (TTM)",        required: true,  patterns: ["pay history", "payment history", "ttm", "as agreed"] },
    { label: "Risk / Credit Grade",      required: true,  patterns: ["risk grade", "credit grade", "grade", "pass", "special mention", "substandard"] },
    { label: "Global Cash Flow / DSCR",  required: true,  patterns: ["global cash flow", "dscr", "debt service", "global dsc", "gdscr"] },
    { label: "Collateral Description",   required: true,  patterns: ["collateral", "ucc", "security interest", "pledge"] },
    { label: "Financial Analysis",       required: true,  patterns: ["financial analysis", "financial review", "income", "revenue", "ebitda"] },
    { label: "Guarantor Information",    required: false, patterns: ["guarantor", "recourse", "personal guarantee"] },
    { label: "Covenant Compliance",      required: false, patterns: ["covenant", "compliance", "financial covenant"] },
    { label: "Analysis / Commentary",    required: true,  patterns: ["analysis", "comment", "discussion", "narrative"] },
  ],
  // Rent Roll
  cre_rent_roll: [
    { label: "Property Address",         required: true,  patterns: ["address", "property", "street", "suite"] },
    { label: "Tenant Names",             required: true,  patterns: ["tenant", "lessee", "occupant"] },
    { label: "Lease Expiry / Term",      required: true,  patterns: ["lease expiry", "expiration", "lease term", "lease end", "lease date"] },
    { label: "Monthly / Annual Rent",    required: true,  patterns: ["rent", "monthly rent", "annual rent", "base rent", "$/sf", "per sq"] },
    { label: "Occupancy Rate",           required: true,  patterns: ["occupancy", "vacant", "leased", "% occupied"] },
    { label: "Square Footage",           required: false, patterns: ["sq ft", "square feet", "sf", "sqft", "nsf", "rsf"] },
  ],
  // PFS / Personal Financial Statement
  cre_guarantor_fin: [
    { label: "Guarantor Name",           required: true,  patterns: ["name", "guarantor", "individual"] },
    { label: "Total Assets",             required: true,  patterns: ["total assets", "assets"] },
    { label: "Total Liabilities",        required: true,  patterns: ["total liabilities", "liabilities"] },
    { label: "Net Worth",                required: true,  patterns: ["net worth", "total net worth"] },
    { label: "Liquid Assets / Cash",     required: true,  patterns: ["liquid", "cash", "checking", "savings", "money market"] },
    { label: "Real Estate Owned",        required: false, patterns: ["real estate", "property owned", "oreo", "reo"] },
    { label: "Date of Statement",        required: true,  patterns: ["date", "as of", "prepared"] },
  ],
  // Account / Payment History
  cre_account_history: [
    { label: "Loan / Account Number",    required: true,  patterns: ["loan #", "account", "loan number"] },
    { label: "12-Month Payment Detail",  required: true,  patterns: ["ttm", "12 month", "twelve month", "payment history", "pay history"] },
    { label: "Delinquency Record",       required: true,  patterns: ["delinquency", "past due", "30 day", "60 day", "90 day", "as agreed", "on time"] },
    { label: "Outstanding Balance",      required: true,  patterns: ["outstanding", "balance", "principal balance"] },
  ],
  // Appraisal
  cre_appraisal: [
    { label: "Property Address",         required: true,  patterns: ["address", "subject property", "property location"] },
    { label: "Appraised Value",          required: true,  patterns: ["appraised value", "as is value", "market value", "estimated value"] },
    { label: "Appraisal Date",           required: true,  patterns: ["date of value", "effective date", "appraisal date", "as of"] },
    { label: "Appraiser Name / Firm",    required: true,  patterns: ["appraiser", "firm", "certified", "state certified"] },
    { label: "Approach to Value",        required: true,  patterns: ["income approach", "sales comparison", "cost approach", "cap rate", "capitalization"] },
    { label: "Cap Rate",                 required: false, patterns: ["cap rate", "capitalization rate", "overall rate"] },
    { label: "NOI",                      required: false, patterns: ["noi", "net operating income"] },
  ],
  // Covenant Compliance
  cre_covenant: [
    { label: "Borrower / Loan Reference",required: true,  patterns: ["borrower", "loan", "facility"] },
    { label: "Covenant Description",     required: true,  patterns: ["covenant", "financial covenant", "minimum dscr", "maximum ltv", "minimum liquidity"] },
    { label: "Required Level",           required: true,  patterns: ["required", "minimum", "maximum", "threshold", "covenant level"] },
    { label: "Actual / Tested Level",    required: true,  patterns: ["actual", "tested", "current", "measured", "calculated"] },
    { label: "Compliance Status",        required: true,  patterns: ["compliant", "in compliance", "pass", "fail", "breach", "waiver"] },
    { label: "Test / Report Date",       required: true,  patterns: ["date", "as of", "period", "quarter", "year end"] },
  ],
};

// Alias cross-loan-type shared doc types
TEMPLATE_FIELDS.ci_account_history   = TEMPLATE_FIELDS.cre_account_history;
TEMPLATE_FIELDS.lev_account_history  = TEMPLATE_FIELDS.cre_account_history;
TEMPLATE_FIELDS.resi_account_history = TEMPLATE_FIELDS.cre_account_history;
TEMPLATE_FIELDS.lev_credit_proposal  = TEMPLATE_FIELDS.ci_credit_proposal;
TEMPLATE_FIELDS.ci_covenant          = TEMPLATE_FIELDS.cre_covenant;
TEMPLATE_FIELDS.lev_covenant         = TEMPLATE_FIELDS.cre_covenant;
TEMPLATE_FIELDS.resi_appraisal       = TEMPLATE_FIELDS.cre_appraisal;

// Run disparity check: given a doc type id and extracted text, return field results
function checkDocxDisparity(docTypeId, text) {
  const fields = TEMPLATE_FIELDS[docTypeId];
  if (!fields) return null; // no template defined for this type
  const t = text.toLowerCase();
  return fields.map(field => {
    const found = field.patterns.some(p => t.includes(p.toLowerCase()));
    return { label: field.label, required: field.required, found };
  });
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
  orange:    "#1B6CB5",   // CEIS blue (nav links, accents)
  orangeHov: "#155A9A",
  oliveBg:   "#2B3A52",   // CEIS dark navy top bar + footer
  navBg:     "#FFFFFF",
  bodyBg:    "#F2F4F7",
  cardBg:    "#FFFFFF",
  border:    "#D8DCE3",
  text:      "#1A1F2E",
  textMid:   "#4A5568",
  textLight: "#718096",
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
  const [ocrProgress, setOcrProgress] = useState({});
  const fileInputRef = useRef();

  // OCR a single PDF page canvas → text string
  const ocrCanvas = async (canvas, worker) => {
    const { data: { text } } = await worker.recognize(canvas);
    return text;
  };

  // Render PDF pages to canvas and OCR each one
  const extractPdfText = async (file, onProgress) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const numPages = pdf.numPages;
      const worker = await createWorker("eng");
      let fullText = "";

      for (let i = 1; i <= numPages; i++) {
        onProgress && onProgress(i, numPages);
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 }); // higher scale = better OCR
        const canvas = document.createElement("canvas");
        canvas.width  = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        await page.render({ canvasContext: ctx, viewport }).promise;
        const pageText = await ocrCanvas(canvas, worker);
        fullText += pageText + "\n";
      }

      await worker.terminate();
      return fullText || file.name;
    } catch (err) {
      console.warn("PDF OCR failed for", file.name, err);
      return file.name; // graceful fallback
    }
  };

  // Read a File object → plain text content
  const readFileContent = (file, onProgress) => {
    return new Promise(async (resolve) => {
      const isPdf   = file.name.endsWith(".pdf");
      const isExcel = file.name.endsWith(".xlsx") || file.name.endsWith(".xls") || file.name.endsWith(".csv");
      const isDocx  = file.name.endsWith(".docx") || file.name.endsWith(".doc");
      const isText  = file.name.endsWith(".txt")  || file.name.endsWith(".md");

      if (isPdf && file instanceof File) {
        const text = await extractPdfText(file, onProgress);
        resolve(text);
      } else if (isDocx && file instanceof File) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const result = await mammoth.extractRawText({ arrayBuffer });
          resolve(result.value || file.name);
        } catch (err) {
          console.warn("Mammoth DOCX extraction failed:", err);
          resolve(file.name);
        }
      } else if (isExcel && file instanceof File) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const wb = XLSX.read(e.target.result, { type: "array" });
            const text = wb.SheetNames.map(name =>
              XLSX.utils.sheet_to_csv(wb.Sheets[name])
            ).join("\n");
            resolve(text);
          } catch {
            resolve(file.name);
          }
        };
        reader.onerror = () => resolve(file.name);
        reader.readAsArrayBuffer(file);
      } else if (isText && file instanceof File) {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result || file.name);
        reader.onerror  = () => resolve(file.name);
        reader.readAsText(file);
      } else {
        // demo objects with pre-supplied content
        resolve(file.content || file.name);
      }
    });
  };

  const analyze = async (rawFiles) => {
    setProcessing(true);
    setOcrProgress({});
    const processed = await Promise.all(
      rawFiles.map(async (f) => {
        const isPdf  = f.name && f.name.endsWith(".pdf");
        const isDocx = f.name && (f.name.endsWith(".docx") || f.name.endsWith(".doc"));
        const isExcel = f.name && (f.name.endsWith(".xlsx") || f.name.endsWith(".xls"));
        const onProgress = isPdf
          ? (page, total) => setOcrProgress(prev => ({ ...prev, [f.name]: { page, total } }))
          : null;
        const content = await readFileContent(f, onProgress);
        const cls = classifyFile(f.name, content);
        const disparity = (isDocx && cls && f instanceof File)
          ? checkDocxDisparity(cls.id, content)
          : null;
        const source = isPdf ? "ocr-parsed"
          : isDocx ? "docx-parsed"
          : isExcel ? "excel-parsed"
          : "filename";
        return {
          id: Math.random().toString(36).slice(2),
          name: f.name, size: f.size,
          cls, meta: extractMeta(f.name, content),
          source, disparity,
        };
      })
    );
    setDocs(processed);
    setOcrProgress({});
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

      {/* Navy top bar — matches CEIS Review Inc website */}
      <div style={{ background: B.oliveBg, padding: "6px 32px", textAlign: "right" }}>
        <span style={{ fontSize: "11px", color: "#9AABBD", letterSpacing: "0.5px" }}>Commercial Portfolio Advisors EST 1989</span>
      </div>

      {/* White nav bar */}
      <div style={{ background: B.navBg, borderBottom: `2px solid ${B.border}`, padding: "14px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 2px 8px rgba(27,42,78,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          {/* CEIS Review Inc logo — cube icon + wordmark */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {/* Cube icon approximation using nested divs */}
            <div style={{ position: "relative", width: "48px", height: "48px", flexShrink: 0 }}>
              <div style={{ position: "absolute", top: "4px", left: "8px", width: "32px", height: "32px", background: "#2B3A52", borderRadius: "3px", transform: "skewX(-8deg)" }} />
              <div style={{ position: "absolute", top: "0px", left: "14px", width: "26px", height: "26px", background: "#1B6CB5", borderRadius: "3px", transform: "skewX(8deg)" }} />
              <div style={{ position: "absolute", top: "10px", left: "4px", width: "22px", height: "22px", background: "#3B5E85", borderRadius: "2px", opacity: 0.85 }} />
            </div>
            <div style={{ lineHeight: "1.2" }}>
              <div style={{ fontSize: "18px", fontWeight: "800", color: B.text, letterSpacing: "0.5px", fontFamily: "'Arial', sans-serif" }}>
                CEIS <span style={{ color: B.orange }}>REVIEW</span> INC.
              </div>
              <div style={{ fontSize: "10px", color: B.textLight, letterSpacing: "0.3px", fontStyle: "italic" }}>
                Commercial Portfolio Advisors EST 1989
              </div>
            </div>
          </div>
          <div style={{ width: "1px", height: "40px", background: B.border, marginLeft: "8px" }} />
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
              style={{ border: `2px dashed ${dragOver ? B.orange : B.border}`, borderRadius: "6px", padding: "56px 32px", textAlign: "center", cursor: "pointer", background: dragOver ? "#EBF3FC" : "#fff", transition: "all 0.2s" }}
            >
              <div style={{ fontSize: "44px", marginBottom: "12px" }}>📂</div>
              <p style={{ fontSize: "18px", color: B.text, margin: "0 0 6px", fontWeight: "600" }}>Drop your loan package files here</p>
              <p style={{ fontSize: "13px", color: B.textLight, margin: "0 0 24px" }}>PDF · DOCX · XLSX · TXT — matched against the CEIS Credit File Inventory List</p>
              <div style={{ display: "inline-block", padding: "10px 28px", background: B.orange, borderRadius: "3px", color: "#fff", fontSize: "13px", letterSpacing: "1.5px", fontWeight: "700" }}>SELECT FILES</div>
              <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={handleSelect} />
            </div>

            {processing && (
              <div style={{ marginTop: "20px", background: "#fff", border: `1px solid ${B.border}`, borderRadius: "6px", padding: "20px" }}>
                <div style={{ fontSize: "13px", color: B.orange, fontWeight: "600", marginBottom: "14px" }}>
                  Processing documents — PDFs are being OCR&apos;d, this may take a moment...
                </div>
                {files.map((f) => {
                  const prog = ocrProgress[f.name];
                  const isPdf = f.name && f.name.endsWith(".pdf");
                  const isDocx = f.name && (f.name.endsWith(".docx") || f.name.endsWith(".doc"));
                  const isExcel = f.name && (f.name.endsWith(".xlsx") || f.name.endsWith(".xls"));
                  return (
                    <div key={f.name} style={{ marginBottom: "12px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                        <span style={{ fontSize: "12px", color: B.textMid }}>{fileIcon(f.name)} {f.name}</span>
                        <span style={{ fontSize: "11px", color: B.textLight, fontStyle: "italic" }}>
                          {isPdf
                            ? prog ? `OCR · page ${prog.page} of ${prog.total}` : "initialising OCR..."
                            : isDocx ? "extracting text..." : isExcel ? "parsing cells..." : "reading..."}
                        </span>
                      </div>
                      <div style={{ height: "4px", background: B.border, borderRadius: "2px", overflow: "hidden" }}>
                        <div style={{
                          height: "100%",
                          width: isPdf && prog ? `${Math.round((prog.page / prog.total) * 100)}%` : "100%",
                          background: isPdf ? B.orange : B.green,
                          borderRadius: "2px",
                          transition: "width 0.4s ease",
                          animation: (!isPdf || !prog) ? "slide 1.2s ease-in-out infinite" : "none"
                        }} />
                      </div>
                    </div>
                  );
                })}
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
                      {["File", "Matched To", "Type"].map(h => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: "11px", color: B.textLight, letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: "600" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {docs.map((doc, i) => (
                      <tr key={doc.id} style={{ borderBottom: i < docs.length-1 ? `1px solid ${B.border}` : "none" }}>
                        <td style={{ padding: "10px 14px", fontSize: "12px", color: B.text, maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={doc.name}>
                          {fileIcon(doc.name)} {doc.name}
                        </td>
                        <td style={{ padding: "10px 14px", fontSize: "12px" }}>
                          {doc.cls ? <span style={{ color: B.green, fontWeight: "600" }}>{doc.cls.label}</span>
                                   : <span style={{ color: B.red, fontSize: "11px", fontWeight: "600" }}>UNCLASSIFIED</span>}
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                            {doc.cls && <span style={{ background: "#EBF3FC", color: B.orange, padding: "2px 8px", borderRadius: "3px", fontSize: "11px", fontWeight: "600", display: "inline-block" }}>{doc.cls.loanType}</span>}
                            {doc.source === "docx-parsed" && <span style={{ background: "#F3F0FF", color: "#6741D9", padding: "2px 8px", borderRadius: "3px", fontSize: "10px", fontWeight: "600", display: "inline-block" }}>📝 docx parsed</span>}
                            {doc.source === "excel-parsed" && <span style={{ background: "#EFF7F2", color: B.green, padding: "2px 8px", borderRadius: "3px", fontSize: "10px", fontWeight: "600", display: "inline-block" }}>📊 excel parsed</span>}
                            {doc.source === "ocr-parsed" && <span style={{ background: "#EEF3FE", color: "#3B5BDB", padding: "2px 8px", borderRadius: "3px", fontSize: "10px", fontWeight: "600", display: "inline-block" }}>🔍 ocr parsed</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Inventory Checklist */}
              <p style={{ fontSize: "12px", color: B.textLight, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "10px" }}>CEIS Review Inventory Checklist — {loanType}</p>
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

              {/* DOCX Disparity Panel */}
              {docs.filter(d => d.disparity && d.disparity.length > 0).length > 0 && (
                <div style={{ marginTop: "28px" }}>
                  <p style={{ fontSize: "12px", color: B.textLight, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "10px" }}>
                    DOCX Field Disparity — Template vs. Extracted Content
                  </p>
                  {docs.filter(d => d.disparity && d.disparity.length > 0).map(doc => {
                    const missing  = doc.disparity.filter(f => !f.found && f.required);
                    const advisory = doc.disparity.filter(f => !f.found && !f.required);
                    const present  = doc.disparity.filter(f => f.found);
                    const pct = Math.round((present.length / doc.disparity.length) * 100);
                    return (
                      <div key={doc.id} style={{ background: "#fff", border: `1px solid ${B.border}`, borderRadius: "8px", overflow: "hidden", marginBottom: "16px" }}>
                        <div style={{ padding: "14px 18px", background: "#F8F6F3", borderBottom: `1px solid ${B.border}`, display: "flex", alignItems: "center", gap: "12px" }}>
                          <span style={{ fontSize: "16px" }}>📝</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: "13px", fontWeight: "700", color: B.text }}>{doc.name}</div>
                            <div style={{ fontSize: "11px", color: B.textLight, marginTop: "2px" }}>
                              Matched as: <span style={{ color: B.green, fontWeight: "600" }}>{doc.cls.label}</span>
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: "11px", color: B.textLight, marginBottom: "4px" }}>
                              Field coverage: <span style={{ fontWeight: "700", color: pct >= 80 ? B.green : pct >= 50 ? B.amber : B.red }}>{pct}%</span>
                            </div>
                            <div style={{ height: "5px", background: B.border, borderRadius: "3px", overflow: "hidden", width: "120px" }}>
                              <div style={{ height: "100%", width: pct + "%", background: pct >= 80 ? B.green : pct >= 50 ? B.orange : B.red, transition: "width 0.5s ease" }} />
                            </div>
                          </div>
                        </div>
                        {missing.length > 0 && (
                          <div style={{ padding: "12px 18px", borderBottom: `1px solid ${B.border}` }}>
                            <div style={{ fontSize: "10px", color: B.red, fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "8px" }}>
                              ✗ Missing Required Fields ({missing.length})
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                              {missing.map(f => (
                                <span key={f.label} style={{ padding: "3px 10px", background: B.redBg, border: "1px solid #E8B4B0", borderRadius: "4px", fontSize: "12px", color: B.red, fontWeight: "600" }}>
                                  {f.label}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {advisory.length > 0 && (
                          <div style={{ padding: "12px 18px", borderBottom: `1px solid ${B.border}` }}>
                            <div style={{ fontSize: "10px", color: B.amber, fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "8px" }}>
                              ⚠ Advisory — Optional Fields Not Detected ({advisory.length})
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                              {advisory.map(f => (
                                <span key={f.label} style={{ padding: "3px 10px", background: "#FFFBF0", border: "1px solid #F0D080", borderRadius: "4px", fontSize: "12px", color: B.amber }}>
                                  {f.label}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {present.length > 0 && (
                          <div style={{ padding: "12px 18px" }}>
                            <div style={{ fontSize: "10px", color: B.green, fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "8px" }}>
                              ✓ Fields Detected ({present.length})
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                              {present.map(f => (
                                <span key={f.label} style={{ padding: "3px 10px", background: B.greenBg, border: "1px solid #A8D5B8", borderRadius: "4px", fontSize: "12px", color: B.green }}>
                                  {f.label}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
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
        <span style={{ fontSize: "12px", color: "#9AABBD" }}>© CEIS Review Inc. — Commercial Portfolio Advisors EST 1989</span>
        <span style={{ fontSize: "11px", color: "#5A7090", letterSpacing: "1px" }}>DOCUMENT INTELLIGENCE SYSTEM</span>
      </div>

      <style>{`@keyframes slide { 0%{transform:translateX(-100%)} 100%{transform:translateX(280%)} }`}</style>
    </div>
  );
}
