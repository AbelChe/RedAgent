---
name: bee-company-report
description: '处理企业信息收集结果，解析递归的企业信息数据，生成精美的 HTML 资产报告。当用户要求「生成企业报告」「处理企业扫描结果」「查看企业资产报告」时使用。'
allowed-tools: bee_fetch_result, bee_result, read_file, write_file
---

# 企业信息收集报告生成器

## 概述

处理企业信息收集扫描结果，解析递归的企业信息，生成精美的 HTML 报告。报告包含：
- 企业基本信息（名称、信用代码、行业分类等）
- 股权结构树状图
- ICP 备案域名
- 联系方式（电话、邮箱）
- 子公司及分支机构
- 供应商、招标信息
- 微信公众号

## 何时使用

当用户：
- 要求生成企业资产报告
- 需要查看企业扫描结果的可视化报告
- 提供了企业信息 OSS 链接希望生成报告
- 完成了 bee_scan(scan_type="company") 后希望生成报告

## 输入数据格式

企业信息数据为递归结构的 JSON，核心字段：

```json
{
  "name": "企业名称",
  "credit_code": "统一社会信用代码",
  "tianyancha_pid": "天眼查ID",
  "status": "存续/在业/注销",
  "location": "注册地址",
  "company_profile": "公司简介",
  "classification": {
    "industry_sector": "行业领域",
    "administrative_affiliation": "行政归属"
  },
  "email": ["邮箱1", "邮箱2"],
  "phone": ["电话1", "电话2"],
  "percent": 1.0,
  "father_name": "父企业名称",
  "icp_info": [
    {"unit_name": "单位名", "domain": "域名", "service_licence": "备案号"}
  ],
  "supplier": [{"name": "供应商名", "data_source": "来源"}],
  "bidding": [{"title": "招标标题", "purchaser": "采购人", "supplier": "供应商"}],
  "public_wechat": [{"name": "公众号名", "publish_num": "ID"}],
  "sub_enterprise_info": [...],
  "branch": [...]
}
```

## 工作流程

### Step 1：获取扫描结果

**方式 A - 用户提供了 OSS 链接：**

```
bee_fetch_result(oss_links=["<oss_link>"], scan_type="company")
```

**方式 B - 用户提供 task_id/workflow_id：**

```
bee_result(scan_type="company", workflow_id="<workflow_id>")
```

从返回结果中找到 `Summary.unitResultOssLink` 或直接使用返回的数据。

### Step 2：读取数据

```
read_file(path="<ResultStore 返回的文件路径>")
```

### Step 3：生成 HTML 报告

解析数据后，使用 `write_file` 生成自包含的 HTML 报告：

```
write_file(path="workspace_data/reports/<企业名>_report.html", content="<HTML内容>")
```

### Step 4：告知用户

输出报告文件路径，用户可在浏览器中打开。

## 报告结构

生成的 HTML 报告包含以下部分：

1. **概览卡片**
   - 企业总数（含子公司、分支机构）
   - ICP 备案域名数量
   - 联系方式数量
   - 供应商/招标数量

2. **根企业信息**
   - 名称、状态、信用代码
   - 行业分类、行政归属
   - 公司简介
   - 地址、联系方式

3. **股权结构树**
   - 交互式树状图
   - 显示持股比例
   - 区分子公司/分支机构

4. **域名资产**
   - ICP 备案域名列表
   - 备案号、审核时间

5. **联系方式汇总**
   - 电话（去重）
   - 邮箱（去重）

6. **供应链信息**（如有）
   - 供应商列表
   - 招标/采购信息

7. **社交媒体**（如有）
   - 微信公众号列表

## 示例

```
用户：帮我处理新华社的扫描结果，生成报告

1. bee_result(scan_type="company", workflow_id="xxx")
2. read_file(path="workspace_data/results/bee_company/xxx.json")
3. [解析 JSON，生成 HTML]
4. write_file(path="workspace_data/reports/新华社_report.html", content="...")
5. 报告已生成 → workspace_data/reports/新华社_report.html
```

## 注意事项

- 企业数据是递归结构，需深度遍历子公司和分支机构
- ICP 域名需去重展示
- 联系方式需脱敏处理（部分隐藏）
- HTML 报告自包含 CSS/JS，无需外部依赖
- 使用深色主题，适合安全审计场景
