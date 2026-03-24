/**
 * 企业数据类型定义
 */
export interface CompanyClassification {
    industry_sector: string;
    administrative_affiliation: string;
}

export interface ICPInfo {
    unit_name: string;
    domain: string;
    service_licence: string | null;
    verify_time?: string | null;
    company_type?: string | null;
    last_update?: string;
    is_historical?: boolean;
    data_source?: string;
}

export interface Supplier {
    name: string;
    data_source?: string;
}

export interface Bidding {
    title: string;
    purchaser?: string;
    supplier?: string;
    date?: string;
}

export interface WechatAccount {
    name: string;
    publish_num: string;
    qr_code?: string;
    company_name?: string;
}

export interface CompanyInfo {
    name: string;
    credit_code?: string;
    tianyancha_pid?: string;
    status?: string;
    location?: string;
    company_profile?: string;
    classification?: CompanyClassification;
    email?: string[];
    phone?: string[];
    percent?: number;
    father_name?: string | null;
    icp_info?: ICPInfo[];
    supplier?: Supplier[];
    bidding?: Bidding[];
    public_wechat?: WechatAccount[];
    sub_enterprise_info?: CompanyInfo[];
    branch?: CompanyInfo[];
    legal_person?: string;
    reg_capital?: string;
    establish_date?: string;
    business_scope?: string;
    is_branch?: boolean;
}

export interface WechatAccountWithCompany extends WechatAccount {
    company_name?: string;
}

export interface ReportStats {
    totalCompanies: number;
    subsidiaryCount: number;
    branchCount: number;
    icpDomainCount: number;
    uniqueDomains: number;
    phoneCount: number;
    emailCount: number;
    supplierCount: number;
    biddingCount: number;
    wechatCount: number;
}

export interface ReportData {
    rootCompany: CompanyInfo;
    stats: ReportStats;
    allICPDomains: ICPInfo[];
    allPhones: string[];
    allEmails: string[];
    allSuppliers: Supplier[];
    allBiddings: Bidding[];
    allWechat: WechatAccount[];
    companyTree: CompanyTreeNode;
}

export interface CompanyTreeNode {
    company: CompanyInfo;
    children: CompanyTreeNode[];
    isBranch: boolean;
    depth: number;
}

// 原始 API 返回的数据结构
export interface RawCompanyData {
    name?: string;
    credit_code?: string;
    tianyancha_pid?: string;
    status?: string;
    location?: string;
    company_profile?: string;
    classification?: {
        industry_sector?: string;
        administrative_affiliation?: string;
    };
    email?: string[];
    phone?: string[];
    percent?: number;
    icp_info?: Array<{
        unit_name?: string;
        domain: string;
        service_licence?: string | null;
        verify_time?: string | null;
    }>;
    supplier?: Array<{
        name: string;
        data_source?: string;
    }>;
    bidding?: Array<{
        title: string;
        purchaser?: string;
        supplier?: string;
        date?: string;
    }>;
    public_wechat?: Array<{
        name: string;
        publish_num: string;
        qr_code?: string;
    }>;
    sub_enterprise_info?: RawCompanyData[];
    branch?: RawCompanyData[];
}
