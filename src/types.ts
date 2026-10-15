import {
  LEAD_STATUSES, SURVEY_STATUSES, QUOTATION_STATUSES, INSTALLATION_STATUSES,
  PAYMENT_STATUSES, SERVICE_REQUEST_STATUSES, SUBSIDY_STATUSES,
  DOC_VERIFY_STATUSES, DOC_STATUSES, FEEDBACK_STATUSES, INVOICE_STATUSES,
} from './lib/statuses';

export type PermissionModule = 
  | 'leads' | 'inventory' | 'quotations' | 'surveys' | 'installations' 
  | 'payments' | 'service_requests' | 'employees' | 'analytics' | 'blog' 
  | 'feedback' | 'website' | 'chat' | 'settings' | 'notifications'
  | 'documents' | 'customers' | 'tasks' | 'templates';

export interface Permission {
  module: PermissionModule;
  canCreate: boolean;
  canRead: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

export type Role = 'ADMIN' | 'MANAGER' | 'SALES_EXECUTIVE' | 'ENGINEER' | 'CUSTOMER' | 'SUPER_ADMIN';

export interface Employee {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  avatar?: string;
  profilePic?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  regions?: { id: string; name: string }[];
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Region {
  id: string;
  name: string;
  createdAt?: string;
}

// These unions mirror the backend enums. They used to be lowercase /
// Title Case with a 'proposal' member that the server never accepted; they
// now derive from the canonical constants in @/lib/statuses so a type error
// and a runtime 400 can never disagree.
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export type LeadSource = 'WEBSITE' | 'REFERRAL' | 'WALK_IN' | 'PHONE_INQUIRY' | 'EVENT' | 'OTHER';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  regions?: { id: string; name: string; createdAt?: string }[];
  department?: string;
  phone: string;
  isActive?: boolean;
  avatar?: string;
  profilePic?: string;
  isSuperAdmin?: boolean;
  permissions?: Permission[];
}

export interface Lead {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  source?: string;
  region?: { id: string; name: string } | null;
  regionId?: string;
  owner?: { id: string; name: string; email?: string; role: string } | null;
  ownerId?: string;
  status: string;
  notes?: string;
  bookingDate?: string;
  projectStage?: string;
  nmApplicationId?: string;
  channelPartner?: string;
  projectCost?: number;
  ivrsNumber?: string;
  projectType?: string;
  liaisoningWork?: string;
  liaisoningCost?: number;
  liaisoningStage?: string;
  googleLocation?: string;
  sanctionedLoadKw?: number;
  dcCapacityKw?: number;
  numberOfPanels?: number;
  solarPanelBrand?: string;
  solarPanelWp?: string;
  inverterCapacityKw?: number;
  inverterBrand?: string;
  structureSize?: string;
  numberOfStructure?: number;
  bookingAmount?: number;
  finalPayment?: number;
  loanAmount?: number;
  loanBankName?: string;
  dateOfInstallation?: string;
  dateOfCommissioning?: string;
  documentsHandOverDate?: string;
  amcServices?: string;
  tentativeInstallationDate?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface LeadComment {
  id: string;
  comment: string;
  createdAt: string;
  user: { id: string; name: string; role: string; email?: string };
}

export interface SiteSurvey {
  id: string;
  leadId: string;
  clientName: string;
  surveyDate: string;
  engineerId: string;
  roofType: 'RCC' | 'Metal' | 'Ground Mount' | 'Shed';
  roofArea: number;
  shadeAnalysis: 'None' | 'Partial' | 'Heavy';
  monthlyBill: number;
  sanctionedLoad: number;
  discomName: string;
  photos: string[];
  reportUrl?: string;
  remarks: string;
  status: (typeof SURVEY_STATUSES)[number];
  region: Region;
}

export interface Quotation {
  id: string;
  leadId: string;
  clientName: string;
  address: string;
  systemSizeKW: number;
  panelBrand: string;
  inverterBrand: string;
  batteryRequired: boolean;
  batteryBrand?: string;
  batteryCount?: number;
  totalCost: number;
  discount: number;
  gstPercent: number;
  subsidyAmount: number;
  finalAmount: number;
  validTill: string;
  notes: string;
  status: (typeof QUOTATION_STATUSES)[number];
  createdAt: string;
  region: Region;
}

export interface Installation {
  id: string;
  clientId: string;
  clientName: string;
  quotationId: string;
  engineerId: string;
  startDate: string;
  expectedEndDate: string;
  status: (typeof INSTALLATION_STATUSES)[number];
  region: Region;
  panelCount: number;
  inverterModel: string;
  batteryCount: number;
  mountingType: 'Rooftop' | 'Ground';
  netMeterApplied: boolean;
  netMeterStatus: 'Pending' | 'Applied' | 'Approved' | 'Installed';
  inspectionStatus: 'Pending' | 'Done';
  photos: string[];
  remarks: string;
  assetDetails?: AssetDetails;
}

export interface AssetDetails {
  systemSizeKW: number;
  panelBrand: string;
  panelModel: string;
  panelCount: number;
  panelWatt: number;
  panelSerialNumbers: string[];
  panelInstallationDate: string;
  panelWarrantyExpiry: string;
  inverterBrand: string;
  inverterModel: string;
  inverterCapacity: string;
  inverterSerialNumber: string;
  inverterWarrantyExpiry: string;
  batteryRequired: boolean;
  batteryBrand?: string;
  batteryModel?: string;
  batteryCount?: number;
  batterySerialNumbers?: string[];
  batteryWarrantyExpiry?: string;
  netMeterNumber?: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: 'Panel' | 'Inverter' | 'Battery' | 'Cable' | 'Structure' | 'Accessories' | 'Other';
  brand: string;
  unit: 'Nos' | 'Meters' | 'Sets' | 'Kg';
  currentStock: number;
  minThreshold: number;
  pricePerUnit: number;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  clientId: string;
  clientName: string;
  installationId: string;
  totalAmount: number;
  receivedAmount: number;
  pendingAmount: number;
  status: (typeof PAYMENT_STATUSES)[number];
  mode: 'Cash' | 'Cheque' | 'Online Transfer' | 'EMI';
  installments: {
    amount: number;
    dueDate: string;
    paidDate?: string;
    status: (typeof INVOICE_STATUSES)[number];
  }[];
  subsidyStatus: (typeof SUBSIDY_STATUSES)[number];
  invoiceNumber: string;
  region: Region;
}

export interface ServiceRequest {
  id: string;
  clientId: string;
  clientName: string;
  type: 'AMC' | 'Complaint' | 'Warranty Claim' | 'General Checkup';
  description: string;
  engineerId: string;
  visitDate: string;
  partsUsed: { itemId: string; quantity: number }[];
  resolutionNotes: string;
  photos: string[];
  status: (typeof SERVICE_REQUEST_STATUSES)[number];
  amcStartDate?: string;
  amcEndDate?: string;
  amcAmount?: number;
  region: Region;
}

export interface WebsiteResponse {
  id: string;
  name: string;
  phone: string;
  email: string;
  message: string;
  source: string;
  date: string;
  status: (typeof FEEDBACK_STATUSES)[number];
}

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  category: string;
  date: string;
  readTime: number;
  featured: boolean;
  heroImage?: string | null;
  author?: string | null;
  excerpt?: string | null;
  content?: any;
  tags?: string[];
  fieldData?: any;
  relatedSlugs?: string | null;
  meta?: any;
  createdAt: string;
  updatedAt: string;
}

// --- CRM Pipeline Update (backend `main` live) ---
export type DocType = 'KYC' | 'SITE' | 'NET_METERING' | 'FINANCIAL' | 'INSTALLATION' | 'HANDOVER';
export type DocStatus = (typeof DOC_STATUSES)[number];
export type DocVerifyStatus = (typeof DOC_VERIFY_STATUSES)[number];
export type SubsidyStatus = (typeof SUBSIDY_STATUSES)[number];
// Backend survey statuses are SCREAMING_SNAKE; legacy UI used Title Case — always normalize.
export type SurveyStatus = (typeof SURVEY_STATUSES)[number];

export interface CrmDocument {
  id: string;
  leadId: string;
  docType: DocType;
  title: string;
  fileUrl: string;
  status: DocStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface Customer360 {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  region?: { id: string; name: string } | null;
  subsidyStatus?: SubsidyStatus;
  docVerifyStatus?: DocVerifyStatus;
  leadId?: string;
  lead?: {
    id: string;
    name?: string;
    phone?: string;
    documents?: CrmDocument[];
    installation?: {
      status?: string;
      startDate?: string;
      expectedEndDate?: string;
      completionDate?: string;
      progress?: number;
    } | null;
  } | null;
  installation?: {
    status?: string;
    startDate?: string;
    expectedEndDate?: string;
    completionDate?: string;
    progress?: number;
  } | null;
  createdAt?: string;
  updatedAt?: string;
}
