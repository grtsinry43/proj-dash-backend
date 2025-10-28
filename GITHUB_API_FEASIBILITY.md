# GitHub Dashboard API 可行性分析报告

## 📊 功能模块 vs GitHub API 支持情况

---

## 1. 仓库概览卡片区

### ✅ 完全支持

| 功能                     | API 端点                              | 返回数据                                            |
| ------------------------ | ------------------------------------- | --------------------------------------------------- |
| **基本信息**             | `GET /repos/{owner}/{repo}`           | 仓库名、描述、创建时间                              |
| **Star/Fork/Watch 数量** | `GET /repos/{owner}/{repo}`           | `stargazers_count`, `forks_count`, `watchers_count` |
| **语言分布**             | `GET /repos/{owner}/{repo}/languages` | `{ "JavaScript": 12345, "Python": 6789 }`           |
| **License**              | `GET /repos/{owner}/{repo}`           | `license.name`, `license.key`                       |
| **Topics**               | `GET /repos/{owner}/{repo}/topics`    | 标签数组                                            |
| **最后更新时间**         | `GET /repos/{owner}/{repo}`           | `updated_at`, `pushed_at`                           |
| **仓库大小**             | `GET /repos/{owner}/{repo}`           | `size` (KB)                                         |
| **开源评分**             | -                                     | ❌ **不支持**，需自行计算                           |

**实现建议：**

- 开源评分可通过组合多个指标计算（Star 数量、贡献者数量、更新频率、文档完整性等）

---

## 2. 活动时间线 (Activity Timeline)

### ⚠️ 部分支持（有限制）

| 功能                    | API 端点                                          | 数据可用性 | 限制                          |
| ----------------------- | ------------------------------------------------- | ---------- | ----------------------------- |
| **最近 commits**        | `GET /repos/{owner}/{repo}/commits`               | ✅ 支持    | 分页限制，最多 100/页         |
| **最近 PRs**            | `GET /repos/{owner}/{repo}/pulls`                 | ✅ 支持    | 可过滤状态（open/closed/all） |
| **最近 Issues**         | `GET /repos/{owner}/{repo}/issues`                | ✅ 支持    | Issues 和 PRs 混合返回        |
| **每日/每周提交热力图** | `GET /repos/{owner}/{repo}/stats/commit_activity` | ✅ 支持    | **仅最近 52 周**              |
| **贡献者活跃度趋势**    | `GET /repos/{owner}/{repo}/stats/contributors`    | ✅ 支持    | **<10k commits 仓库**         |

**API 示例：**

```bash
# 提交活动（按周统计）
GET /repos/{owner}/{repo}/stats/commit_activity
# 返回：[{ "days": [0,3,5,2,1,0,0], "total": 11, "week": 1302508800 }]

# 贡献者统计
GET /repos/{owner}/{repo}/stats/contributors
# 返回：[{ "author": {...}, "total": 135, "weeks": [...] }]
```

**⚠️ 重要限制：**

- 统计数据需要缓存，首次请求返回 `202 Accepted`，需要等待后台计算
- 超过 10,000 commits 的仓库**无法获取详细统计**

---

## 3. 代码统计面板

### ⚠️ 有限支持

| 功能                     | API 端点                                                     | 数据可用性    | 限制                           |
| ------------------------ | ------------------------------------------------------------ | ------------- | ------------------------------ |
| **语言分布饼图**         | `GET /repos/{owner}/{repo}/languages`                        | ✅ 支持       | 返回字节数，非百分比           |
| **代码量趋势**           | `GET /repos/{owner}/{repo}/stats/code_frequency`             | ⚠️ 有限       | **仅周级别统计，<10k commits** |
| **文件结构**             | `GET /repos/{owner}/{repo}/git/trees/{tree_sha}?recursive=1` | ✅ 支持       | 需遍历 tree SHA                |
| **热点文件（最常修改）** | -                                                            | ❌ **不支持** | 需自行分析 commits             |

**代码频率 API：**

```bash
GET /repos/{owner}/{repo}/stats/code_frequency
# 返回：[[1302508800, 1124, -435], ...]  # [周时间戳, 新增行, 删除行]
```

**实现建议：**

- 热点文件需要自己爬取所有 commits，分析每个文件的修改频次
- 文件结构可以通过 Git Trees API 递归获取

---

## 4. Issue/PR 管理看板

### ✅ 完全支持

| 功能             | API 端点                                                   | 返回数据                  |
| ---------------- | ---------------------------------------------------------- | ------------------------- |
| **状态分布**     | `GET /repos/{owner}/{repo}/issues?state=all`               | Open/Closed 数量          |
| **优先级标签云** | `GET /repos/{owner}/{repo}/labels`                         | 所有标签及颜色            |
| **响应时间**     | `GET /repos/{owner}/{repo}/issues`                         | `created_at`, `closed_at` |
| **Issue 时间线** | `GET /repos/{owner}/{repo}/issues/{issue_number}/timeline` | 完整事件历史              |
| **PR 审查状态**  | `GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews`    | 审查状态和评论            |

**API 示例：**

```bash
# 获取所有 Issues（包含 PRs）
GET /repos/{owner}/{repo}/issues?state=all&per_page=100

# 区分 Issue 和 PR
if (issue.pull_request) { /* 这是 PR */ }

# 获取 Issue 时间线
GET /repos/{owner}/{repo}/issues/1/timeline
# 返回：创建、关闭、标签变更、评论等事件
```

**计算响应时间：**

- 平均关闭时间 = `closed_at - created_at` 的平均值
- 首次响应时间 = 第一条评论时间 - 创建时间

---

## 5. 贡献者分析

### ⚠️ 部分支持（有性能限制）

| 功能                | API 端点                                       | 数据可用性    | 限制                         |
| ------------------- | ---------------------------------------------- | ------------- | ---------------------------- |
| **核心贡献者榜单**  | `GET /repos/{owner}/{repo}/contributors`       | ✅ 支持       | 按提交数排序                 |
| **贡献者头像墙**    | `GET /repos/{owner}/{repo}/contributors`       | ✅ 支持       | 包含 `avatar_url`            |
| **提交量/增删行数** | `GET /repos/{owner}/{repo}/stats/contributors` | ⚠️ 有限       | **<10k commits**             |
| **新老贡献者比例**  | `GET /repos/{owner}/{repo}/stats/contributors` | ⚠️ 有限       | 需自行分析                   |
| **协作网络图**      | -                                              | ❌ **不支持** | 需分析 commits 的 co-authors |

**Contributors API：**

```bash
# 获取贡献者列表
GET /repos/{owner}/{repo}/contributors
# 返回：[{ "login": "user", "contributions": 123, "avatar_url": "..." }]

# 获取详细统计（需等待缓存）
GET /repos/{owner}/{repo}/stats/contributors
# 返回：[{ "author": {...}, "total": 135, "weeks": [{ "w": 1302508800, "a": 6898, "d": 77, "c": 10 }] }]
```

**⚠️ 限制：**

- GraphQL API **不支持**获取贡献者，必须用 REST API
- 协作网络图需要自己分析 Git 的 `Co-authored-by` 标记

---

## 6. Release & 版本管理

### ✅ 完全支持

| 功能             | API 端点                                             | 返回数据                       |
| ---------------- | ---------------------------------------------------- | ------------------------------ |
| **版本时间轴**   | `GET /repos/{owner}/{repo}/releases`                 | 所有 releases                  |
| **最新 Release** | `GET /repos/{owner}/{repo}/releases/latest`          | 最新版本信息                   |
| **按标签获取**   | `GET /repos/{owner}/{repo}/releases/tags/{tag}`      | 指定版本                       |
| **更新日志**     | `POST /repos/{owner}/{repo}/releases/generate-notes` | 自动生成 Changelog             |
| **下载统计**     | `GET /repos/{owner}/{repo}/releases/{id}`            | 每个 asset 的 `download_count` |

**Release API 示例：**

```bash
# 获取所有 releases
GET /repos/{owner}/{repo}/releases
# 返回：[{ "tag_name": "v1.0.0", "name": "Release 1.0", "assets": [...] }]

# 每个 asset 包含下载统计
{
  "name": "app.zip",
  "download_count": 12345,
  "size": 9876543,
  "created_at": "2023-01-01T12:00:00Z"
}

# 自动生成 Changelog
POST /repos/{owner}/{repo}/releases/generate-notes
{
  "tag_name": "v1.0.0",
  "previous_tag_name": "v0.9.0"
}
```

---

## 7. 依赖关系可视化

### ⚠️ 仅 GraphQL 支持

| 功能         | API 端点                           | 数据可用性    | 限制                |
| ------------ | ---------------------------------- | ------------- | ------------------- |
| **依赖树**   | GraphQL `dependencyGraphManifests` | ⚠️ 仅 GraphQL | REST API **不支持** |
| **安全漏洞** | GraphQL `vulnerabilityAlerts`      | ⚠️ 仅 GraphQL | 需启用 Dependabot   |
| **更新提醒** | GraphQL `dependabot`               | ⚠️ 仅 GraphQL | -                   |

**GraphQL 查询示例：**

```graphql
query {
  repository(owner: "facebook", name: "react") {
    dependencyGraphManifests {
      edges {
        node {
          filename
          dependencies {
            edges {
              node {
                packageName
                requirements
                hasDependencies
              }
            }
          }
        }
      }
    }
    vulnerabilityAlerts(first: 10) {
      edges {
        node {
          securityVulnerability {
            package {
              name
            }
            severity
            advisory {
              summary
            }
          }
        }
      }
    }
  }
}
```

**⚠️ 限制：**

- **必须使用 GraphQL API**，REST API 无此功能
- 需要仓库启用 Dependency Graph 和 Dependabot
- 私有仓库需要 `repo` 权限

---

## 8. CI/CD 状态监控

### ✅ 完全支持

| 功能                 | API 端点                                                  | 返回数据             |
| -------------------- | --------------------------------------------------------- | -------------------- |
| **工作流列表**       | `GET /repos/{owner}/{repo}/actions/workflows`             | 所有 workflows       |
| **工作流运行状态**   | `GET /repos/{owner}/{repo}/actions/runs`                  | 运行历史             |
| **特定工作流的运行** | `GET /repos/{owner}/{repo}/actions/workflows/{id}/runs`   | 特定 workflow 的运行 |
| **运行详情**         | `GET /repos/{owner}/{repo}/actions/runs/{run_id}`         | 状态、结论、时长     |
| **任务详情**         | `GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs`    | 每个 job 的状态      |
| **使用统计**         | `GET /repos/{owner}/{repo}/actions/workflows/{id}/timing` | ⚠️ 已废弃            |

**GitHub Actions API：**

```bash
# 获取工作流运行历史
GET /repos/{owner}/{repo}/actions/runs
# 返回：{
#   "workflow_runs": [{
#     "id": 123,
#     "status": "completed",
#     "conclusion": "success",
#     "run_started_at": "2023-01-01T10:00:00Z",
#     "updated_at": "2023-01-01T10:05:30Z"
#   }]
# }

# 计算运行时长
duration = updated_at - run_started_at
```

**构建成功率计算：**

```javascript
const runs = await fetch('/repos/owner/repo/actions/runs')
const successRate = runs.filter((r) => r.conclusion === 'success').length / runs.length
const avgDuration =
  runs.reduce((sum, r) => sum + (r.updated_at - r.run_started_at), 0) / runs.length
```

---

## 9. 流量统计 (Traffic)

### ⚠️ 有严重限制

| 功能              | API 端点                                              | 数据可用性    | 限制         |
| ----------------- | ----------------------------------------------------- | ------------- | ------------ |
| **页面访问量**    | `GET /repos/{owner}/{repo}/traffic/views`             | ⚠️ 有限       | **仅 14 天** |
| **Clone 统计**    | `GET /repos/{owner}/{repo}/traffic/clones`            | ⚠️ 有限       | **仅 14 天** |
| **Top Referrers** | `GET /repos/{owner}/{repo}/traffic/popular/referrers` | ⚠️ 有限       | **仅 14 天** |
| **Top Paths**     | `GET /repos/{owner}/{repo}/traffic/popular/paths`     | ⚠️ 有限       | **仅 14 天** |
| **历史流量**      | -                                                     | ❌ **不支持** | -            |

**❗ 严重限制：**

- GitHub **仅保留 14 天**的流量数据
- 无法获取历史流量统计
- **必须定期轮询并自行存储**才能构建历史趋势图

**解决方案：**

1. 使用 GitHub Actions 每天自动抓取数据存入数据库
2. 参考开源项目：[github-repo-stats](https://github.com/marketplace/actions/github-repo-stats)

---

## 10. Star 历史趋势

### ⚠️ 有分页限制

| 功能                | API 端点                                               | 数据可用性 | 限制           |
| ------------------- | ------------------------------------------------------ | ---------- | -------------- |
| **Stargazers 列表** | `GET /repos/{owner}/{repo}/stargazers`                 | ✅ 支持    | 最多 40k stars |
| **Star 时间戳**     | 使用 header `Accept: application/vnd.github.star+json` | ✅ 支持    | 最多 40k stars |

**获取 Star 时间戳：**

```bash
curl -H "Accept: application/vnd.github.star+json" \
  https://api.github.com/repos/facebook/react/stargazers?per_page=100&page=1

# 返回：[{ "starred_at": "2023-01-01T12:00:00Z", "user": {...} }]
```

**⚠️ 限制：**

- 每页最多 100 个，最多 400 页 = **40,000 stars**
- 超过 40k stars 的仓库**无法获取完整历史**

---

## 📋 API 限制总结

### Rate Limits（速率限制）

| 认证方式        | 速率限制       |
| --------------- | -------------- |
| **未认证**      | 60 次/小时     |
| **OAuth Token** | 5,000 次/小时  |
| **GitHub App**  | 15,000 次/小时 |

### 数据限制

| 数据类型                | 限制                        |
| ----------------------- | --------------------------- |
| **统计数据（stats）**   | 仅 <10,000 commits 的仓库   |
| **流量数据（traffic）** | 仅 14 天                    |
| **Star 历史**           | 最多 40,000 个              |
| **分页**                | 每页最多 100 条             |
| **Contributors**        | GraphQL 不支持，必须用 REST |

---

## ✅ 推荐实现方案

### 核心功能（完全支持）

1. ✅ 仓库概览卡片
2. ✅ Issue/PR 管理看板
3. ✅ Release 版本管理
4. ✅ CI/CD 状态监控

### 需要定期采集数据

5. ⚠️ 流量统计（每天爬取一次，存入数据库）
6. ⚠️ Star 历史（定期更新）

### 需要混合使用 REST + GraphQL

7. ⚠️ 依赖关系可视化（GraphQL）
8. ⚠️ 安全漏洞（GraphQL）

### 需要自行计算/分析

9. 📊 开源评分（组合多个指标）
10. 📊 热点文件分析（分析 commits）
11. 📊 协作网络图（分析 co-authors）

---

## 🚀 技术栈建议

### 后端

- **REST API**: 使用 Octokit (`@octokit/rest`)
- **GraphQL**: 使用 `@octokit/graphql`
- **定时任务**: GitHub Actions + Cron
- **缓存**: Redis（缓存 stats 数据，避免 202 响应）

### 前端

- **图表库**: Recharts / D3.js / Apache ECharts
- **热力图**: `react-calendar-heatmap`
- **网络图**: `react-force-graph` / `cytoscape.js`
- **时间线**: `react-vertical-timeline`

---

## 📌 注意事项

1. **统计数据可能需要等待**：首次请求返回 `202`，需要轮询直到返回 `200`
2. **流量数据必须自行存储**：否则 14 天后数据丢失
3. **大型仓库限制多**：>10k commits 的仓库很多统计不可用
4. **GraphQL 和 REST 混用**：依赖图必须用 GraphQL，其他用 REST 更方便
5. **速率限制**：建议使用 GitHub App 获取更高的速率限制

---

## 🔗 参考文档

- [GitHub REST API 文档](https://docs.github.com/en/rest)
- [GitHub GraphQL API 文档](https://docs.github.com/en/graphql)
- [Octokit.js 官方文档](https://octokit.github.io/rest.js/)
- [GitHub Actions API](https://docs.github.com/en/rest/actions)
