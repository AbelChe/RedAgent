/**
 * 企业数据解析器
 *
 * 解析递归的企业信息数据，提取所有企业、ICP域名、联系方式等信息
 */
import {
    CompanyInfo,
    ICPInfo,
    Supplier,
    Bidding,
    WechatAccount,
    ReportData,
    ReportStats,
    CompanyTreeNode,
    RawCompanyData
} from './types';

/**
 * 解析原始企业数据，生成报告数据
 */
export function parseCompanyData(rawData: RawCompanyData | RawCompanyData[], rootName?: string): ReportData {
    const companies: CompanyInfo[] = [];
    const icpDomains: ICPInfo[] = [];
    const phones: Set<string> = new Set();
    const emails: Set<string> = new Set();
    const suppliers: Supplier[] = [];
    const biddings: Bidding[] = [];
    const wechatAccounts: WechatAccount[] = [];

    // 处理数组或单个对象
    const dataArray = Array.isArray(rawData) ? rawData : [rawData];

    // 递归遍历所有企业
    for (const item of dataArray) {
        traverseCompany(
            item,
            null,
            0,
            companies,
            icpDomains,
            phones,
            emails,
            suppliers,
            biddings,
            wechatAccounts
        );
    }

    // 找到根企业（没有父企业名称的）
    const rootCompany = companies.find(c => c.father_name === null || c.father_name === undefined)
        || companies[0];

    // 构建树状结构
    const companyTree = buildCompanyTree(rootCompany, companies, 0);

    // 计算统计数据
    const stats: ReportStats = {
        totalCompanies: companies.length,
        subsidiaryCount: companies.filter(c => !c.is_branch && c.father_name).length,
        branchCount: companies.filter(c => c.is_branch).length,
        icpDomainCount: icpDomains.length,
        uniqueDomains: new Set(icpDomains.map(i => i.domain)).size,
        phoneCount: phones.size,
        emailCount: emails.size,
        supplierCount: suppliers.length,
        biddingCount: biddings.length,
        wechatCount: wechatAccounts.length
    };

    return {
        rootCompany,
        stats,
        allICPDomains: deduplicateICP(icpDomains),
        allPhones: Array.from(phones).filter(p => p && p.trim()),
        allEmails: Array.from(emails).filter(e => e && e.trim()),
        allSuppliers: suppliers,
        allBiddings: biddings,
        allWechat: wechatAccounts,
        companyTree
    };
}

/**
 * 递归遍历企业数据
 */
function traverseCompany(
    data: RawCompanyData,
    fatherName: string | null,
    depth: number,
    companies: CompanyInfo[],
    icpDomains: ICPInfo[],
    phones: Set<string>,
    emails: Set<string>,
    suppliers: Supplier[],
    biddings: Bidding[],
    wechatAccounts: WechatAccount[]
): void {
    // 提取企业基本信息
    const company: CompanyInfo = {
        name: data.name || '未知企业',
        credit_code: data.credit_code,
        tianyancha_pid: data.tianyancha_pid,
        status: data.status || '未知',
        location: data.location,
        company_profile: data.company_profile,
        classification: data.classification ? {
            industry_sector: data.classification.industry_sector || '',
            administrative_affiliation: data.classification.administrative_affiliation || ''
        } : undefined,
        email: data.email || [],
        phone: data.phone || [],
        percent: data.percent,
        father_name: fatherName,
        is_branch: false
    };
    companies.push(company);

    // 提取联系方式
    if (data.phone && Array.isArray(data.phone)) {
        data.phone.forEach(p => {
            if (p && p.trim()) phones.add(p.trim());
        });
    }
    if (data.email && Array.isArray(data.email)) {
        data.email.forEach(e => {
            if (e && e.trim()) emails.add(e.trim());
        });
    }

    // 提取 ICP 域名
    if (data.icp_info && Array.isArray(data.icp_info)) {
        for (const icp of data.icp_info) {
            if (icp.domain) {
                icpDomains.push({
                    unit_name: icp.unit_name || data.name || '未知',
                    domain: icp.domain,
                    service_licence: icp.service_licence || null,
                    verify_time: icp.verify_time || null
                });
            }
        }
    }

    // 提取供应商信息
    if (data.supplier && Array.isArray(data.supplier)) {
        for (const s of data.supplier) {
            if (s.name) {
                suppliers.push({
                    name: s.name,
                    data_source: s.data_source
                });
            }
        }
    }

    // 提取招标信息
    if (data.bidding && Array.isArray(data.bidding)) {
        for (const b of data.bidding) {
            if (b.title) {
                biddings.push({
                    title: b.title,
                    purchaser: b.purchaser,
                    supplier: b.supplier,
                    date: b.date
                });
            }
        }
    }

    // 提取微信公众号
    if (data.public_wechat && Array.isArray(data.public_wechat)) {
        for (const w of data.public_wechat) {
            if (w.name) {
                wechatAccounts.push({
                    name: w.name,
                    publish_num: w.publish_num,
                    company_name: data.name
                });
            }
        }
    }

    // 递归处理子公司
    if (data.sub_enterprise_info && Array.isArray(data.sub_enterprise_info)) {
        for (const sub of data.sub_enterprise_info) {
            traverseCompany(
                sub,
                data.name || null,
                depth + 1,
                companies,
                icpDomains,
                phones,
                emails,
                suppliers,
                biddings,
                wechatAccounts
            );
        }
    }

    // 递归处理分支机构
    if (data.branch && Array.isArray(data.branch)) {
        for (const branch of data.branch) {
            // 标记为分支机构
            const branchCompany: CompanyInfo = {
                name: branch.name || `${data.name || ''} 分支机构`,
                credit_code: branch.credit_code || data.credit_code,
                tianyancha_pid: branch.tianyancha_pid,
                status: branch.status || '存续',
                location: branch.location,
                father_name: data.name || null,
                is_branch: true
            };
            companies.push(branchCompany);

            // 递归处理分支机构下的子公司
            if (branch.sub_enterprise_info && Array.isArray(branch.sub_enterprise_info)) {
                for (const sub of branch.sub_enterprise_info) {
                    traverseCompany(
                        sub,
                        branch.name || null,
                        depth + 2,
                        companies,
                        icpDomains,
                        phones,
                        emails,
                        suppliers,
                        biddings,
                        wechatAccounts
                    );
                }
            }
        }
    }
}

/**
 * 构建企业树状结构
 */
function buildCompanyTree(
    root: CompanyInfo | undefined,
    allCompanies: CompanyInfo[],
    depth: number
): CompanyTreeNode {
    if (!root) {
        return {
            company: { name: '未知企业', status: '未知' } as CompanyInfo,
            children: [],
            isBranch: false,
            depth: 0
        };
    }

    const children = allCompanies
        .filter(c => c.father_name === root.name)
        .map(child => buildCompanyTree(child, allCompanies, depth + 1));

    return {
        company: root,
        children,
        isBranch: root.is_branch || false,
        depth
    };
}

/**
 * ICP 域名去重
 */
function deduplicateICP(icpList: ICPInfo[]): ICPInfo[] {
    const seen = new Map<string, ICPInfo>();
    for (const icp of icpList) {
        const key = `${icp.domain}|${icp.service_licence || ''}`;
        if (!seen.has(key)) {
            seen.set(key, icp);
        }
    }
    return Array.from(seen.values()).sort((a, b) => a.domain.localeCompare(b.domain));
}

/**
 * 脱敏电话号码
 */
export function maskPhone(phone: string): string {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length >= 11) {
        return cleaned.slice(0, 3) + '****' + cleaned.slice(-4);
    }
    if (cleaned.length >= 7) {
        return cleaned.slice(0, 3) + '****';
    }
    return phone.slice(0, 2) + '***';
}

/**
 * 脱敏邮箱
 */
export function maskEmail(email: string): string {
    if (!email) return '';
    const parts = email.split('@');
    if (parts.length !== 2) return email;
    const [local, domain] = parts;
    const maskedLocal = local.length > 2
        ? local[0] + '***' + local.slice(-1)
        : local[0] + '***';
    return maskedLocal + '@' + domain;
}
