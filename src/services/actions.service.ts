import { Octokit } from '@octokit/rest'
import prisma from '../lib/prisma'
import { redis } from '@/lib/redis'

const CACHE_TTL = {
  WORKFLOWS: 30 * 60, // 30 minutes
  RUNS: 5 * 60, // 5 minutes
  RUN_DETAILS: 5 * 60, // 5 minutes
  JOBS: 5 * 60, // 5 minutes
  STATS: 10 * 60, // 10 minutes
}

interface WorkflowInfo {
  id: number
  name: string
  path: string
  state: string
  badgeUrl?: string
  createdAt: string
  updatedAt: string
}

interface WorkflowRunInfo {
  id: number
  workflowId: number
  runNumber: number
  event: string
  status: string
  conclusion: string | null
  headBranch: string | null
  headSha: string
  triggerUser: string | null
  htmlUrl: string
  runStartedAt: string | null
  updatedAt: string
}

interface WorkflowJobInfo {
  id: number
  runId: number
  name: string
  status: string
  conclusion: string | null
  runnerName: string | null
  runnerGroupName: string | null
  htmlUrl: string
  startedAt: string | null
  completedAt: string | null
}

interface WorkflowStatsInfo {
  totalRuns: number
  successfulRuns: number
  failedRuns: number
  cancelledRuns: number
  successRate: number
  averageDuration: number | null
  recentRuns: WorkflowRunInfo[]
}

function createOctokit(accessToken: string): Octokit {
  return new Octokit({ auth: accessToken })
}

function scopedCacheKey(cacheScope: string, key: string): string {
  return `actions:${cacheScope}:${key}`
}

/**
 * Get all workflows for a repository
 */
export async function getWorkflows(
  accessToken: string,
  cacheScope: string,
  owner: string,
  repo: string
): Promise<WorkflowInfo[]> {
  const octokit = createOctokit(accessToken)
  const cacheKey = scopedCacheKey(cacheScope, `workflows:${owner}/${repo}`)

  // Try to get from cache
  try {
    const cached = await redis.get(cacheKey)
    if (cached && typeof cached === 'string') {
      return JSON.parse(cached) as WorkflowInfo[]
    }
  } catch (error) {
    console.info('Redis cache miss for workflows:', error)
  }

  // Fetch from GitHub API
  const response = await octokit.rest.actions.listRepoWorkflows({
    owner,
    repo,
  })

  const workflows: WorkflowInfo[] = response.data.workflows.map((w) => ({
    id: w.id,
    name: w.name,
    path: w.path,
    state: w.state,
    badgeUrl: w.badge_url,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
  }))

  // Get repository ID for database operations
  const repository = await prisma.repository.findUnique({
    where: { fullName: `${owner}/${repo}` },
  })

  if (repository) {
    // Save to database
    for (const workflow of workflows) {
      await prisma.workflow.upsert({
        where: { githubId: workflow.id },
        update: {
          name: workflow.name,
          path: workflow.path,
          state: workflow.state,
          badgeUrl: workflow.badgeUrl,
          githubUpdatedAt: new Date(workflow.updatedAt),
          lastSyncedAt: new Date(),
        },
        create: {
          githubId: workflow.id,
          repositoryId: repository.id,
          name: workflow.name,
          path: workflow.path,
          state: workflow.state,
          badgeUrl: workflow.badgeUrl,
          githubCreatedAt: new Date(workflow.createdAt),
          githubUpdatedAt: new Date(workflow.updatedAt),
          lastSyncedAt: new Date(),
        },
      })
    }
  }

  // Cache the result
  try {
    await redis.setex(cacheKey, CACHE_TTL.WORKFLOWS, JSON.stringify(workflows))
  } catch (error) {
    console.info('Failed to cache workflows:', error)
  }

  return workflows
}

/**
 * Get workflow runs for a repository
 */
export async function getWorkflowRuns(
  accessToken: string,
  cacheScope: string,
  owner: string,
  repo: string,
  options?: {
    status?: 'completed' | 'in_progress' | 'queued'
    perPage?: number
    page?: number
  }
): Promise<{ runs: WorkflowRunInfo[]; totalCount: number }> {
  const octokit = createOctokit(accessToken)
  const { status, perPage = 30, page = 1 } = options ?? {}
  const cacheKey = scopedCacheKey(
    cacheScope,
    `workflow-runs:${owner}/${repo}:${status ?? 'all'}:${String(page)}`
  )

  // Try to get from cache
  try {
    const cached = await redis.get(cacheKey)
    if (cached && typeof cached === 'string') {
      return JSON.parse(cached) as { runs: WorkflowRunInfo[]; totalCount: number }
    }
  } catch (error) {
    console.info('Redis cache miss for workflow runs:', error)
  }

  // Fetch from GitHub API
  const response = await octokit.rest.actions.listWorkflowRunsForRepo({
    owner,
    repo,
    status,
    per_page: perPage,
    page,
  })

  const runs: WorkflowRunInfo[] = response.data.workflow_runs.map((r) => ({
    id: r.id,
    workflowId: r.workflow_id,
    runNumber: r.run_number,
    event: r.event,
    status: r.status ?? 'unknown',
    conclusion: r.conclusion,
    headBranch: r.head_branch,
    headSha: r.head_sha,
    triggerUser: r.triggering_actor?.login ?? null,
    htmlUrl: r.html_url,
    runStartedAt: r.run_started_at ?? null,
    updatedAt: r.updated_at,
  }))

  const result = {
    runs,
    totalCount: response.data.total_count,
  }

  // Get repository for database operations
  const repository = await prisma.repository.findUnique({
    where: { fullName: `${owner}/${repo}` },
  })

  if (repository) {
    // Save to database
    for (const run of runs) {
      // Find or create workflow
      // eslint-disable-next-line no-await-in-loop
      const workflow = await prisma.workflow.findUnique({
        where: { githubId: run.workflowId },
      })

      if (workflow) {
        // eslint-disable-next-line no-await-in-loop
        await prisma.workflowRun.upsert({
          where: { githubId: run.id },
          update: {
            runNumber: run.runNumber,
            event: run.event,
            status: run.status,
            conclusion: run.conclusion,
            headBranch: run.headBranch,
            headSha: run.headSha,
            triggerUser: run.triggerUser,
            htmlUrl: run.htmlUrl,
            runStartedAt: run.runStartedAt ? new Date(run.runStartedAt) : null,
            githubUpdatedAt: new Date(run.updatedAt),
            lastSyncedAt: new Date(),
          },
          create: {
            githubId: run.id,
            workflowId: workflow.id,
            runNumber: run.runNumber,
            event: run.event,
            status: run.status,
            conclusion: run.conclusion,
            headBranch: run.headBranch,
            headSha: run.headSha,
            triggerUser: run.triggerUser,
            htmlUrl: run.htmlUrl,
            runStartedAt: run.runStartedAt ? new Date(run.runStartedAt) : null,
            githubUpdatedAt: new Date(run.updatedAt),
            lastSyncedAt: new Date(),
          },
        })
      }
    }
  }

  // Cache the result
  try {
    await redis.setex(cacheKey, CACHE_TTL.RUNS, JSON.stringify(result))
  } catch (error) {
    console.info('Failed to cache workflow runs:', error)
  }

  return result
}

/**
 * Get runs for a specific workflow
 */
export async function getWorkflowRunsByWorkflow(
  accessToken: string,
  cacheScope: string,
  owner: string,
  repo: string,
  workflowId: number,
  options?: {
    status?: 'completed' | 'in_progress' | 'queued'
    perPage?: number
    page?: number
  }
): Promise<{ runs: WorkflowRunInfo[]; totalCount: number }> {
  const octokit = createOctokit(accessToken)
  const { status, perPage = 30, page = 1 } = options ?? {}
  const cacheKey = scopedCacheKey(
    cacheScope,
    `workflow-runs:${owner}/${repo}:${String(workflowId)}:${status ?? 'all'}:${String(page)}`
  )

  // Try to get from cache
  try {
    const cached = await redis.get(cacheKey)
    if (cached && typeof cached === 'string') {
      return JSON.parse(cached) as { runs: WorkflowRunInfo[]; totalCount: number }
    }
  } catch (error) {
    console.info('Redis cache miss for workflow runs by workflow:', error)
  }

  // Fetch from GitHub API
  const response = await octokit.rest.actions.listWorkflowRuns({
    owner,
    repo,
    workflow_id: workflowId,
    status,
    per_page: perPage,
    page,
  })

  const runs: WorkflowRunInfo[] = response.data.workflow_runs.map((r) => ({
    id: r.id,
    workflowId: r.workflow_id,
    runNumber: r.run_number,
    event: r.event,
    status: r.status ?? 'unknown',
    conclusion: r.conclusion,
    headBranch: r.head_branch,
    headSha: r.head_sha,
    triggerUser: r.triggering_actor?.login ?? null,
    htmlUrl: r.html_url,
    runStartedAt: r.run_started_at ?? null,
    updatedAt: r.updated_at,
  }))

  const result = {
    runs,
    totalCount: response.data.total_count,
  }

  // Cache the result
  try {
    await redis.setex(cacheKey, CACHE_TTL.RUNS, JSON.stringify(result))
  } catch (error) {
    console.info('Failed to cache workflow runs by workflow:', error)
  }

  return result
}

/**
 * Get details of a specific workflow run
 */
export async function getWorkflowRunDetails(
  accessToken: string,
  cacheScope: string,
  owner: string,
  repo: string,
  runId: number
): Promise<WorkflowRunInfo> {
  const octokit = createOctokit(accessToken)
  const cacheKey = scopedCacheKey(cacheScope, `workflow-run:${owner}/${repo}:${String(runId)}`)

  // Try to get from cache
  try {
    const cached = await redis.get(cacheKey)
    if (cached && typeof cached === 'string') {
      return JSON.parse(cached) as WorkflowRunInfo
    }
  } catch (error) {
    console.info('Redis cache miss for workflow run details:', error)
  }

  // Fetch from GitHub API
  const response = await octokit.rest.actions.getWorkflowRun({
    owner,
    repo,
    run_id: runId,
  })

  const run: WorkflowRunInfo = {
    id: response.data.id,
    workflowId: response.data.workflow_id,
    runNumber: response.data.run_number,
    event: response.data.event,
    status: response.data.status ?? 'unknown',
    conclusion: response.data.conclusion,
    headBranch: response.data.head_branch,
    headSha: response.data.head_sha,
    triggerUser: response.data.triggering_actor?.login ?? null,
    htmlUrl: response.data.html_url,
    runStartedAt: response.data.run_started_at ?? null,
    updatedAt: response.data.updated_at,
  }

  // Cache the result
  try {
    await redis.setex(cacheKey, CACHE_TTL.RUN_DETAILS, JSON.stringify(run))
  } catch (error) {
    console.info('Failed to cache workflow run details:', error)
  }

  return run
}

/**
 * Get jobs for a specific workflow run
 */
export async function getWorkflowRunJobs(
  accessToken: string,
  cacheScope: string,
  owner: string,
  repo: string,
  runId: number
): Promise<WorkflowJobInfo[]> {
  const octokit = createOctokit(accessToken)
  const cacheKey = scopedCacheKey(cacheScope, `workflow-jobs:${owner}/${repo}:${String(runId)}`)

  // Try to get from cache
  try {
    const cached = await redis.get(cacheKey)
    if (cached && typeof cached === 'string') {
      return JSON.parse(cached) as WorkflowJobInfo[]
    }
  } catch (error) {
    console.info('Redis cache miss for workflow jobs:', error)
  }

  // Fetch from GitHub API
  const response = await octokit.rest.actions.listJobsForWorkflowRun({
    owner,
    repo,
    run_id: runId,
  })

  const jobs: WorkflowJobInfo[] = response.data.jobs.map((j) => ({
    id: j.id,
    runId: j.run_id,
    name: j.name,
    status: j.status,
    conclusion: j.conclusion,
    runnerName: j.runner_name ?? null,
    runnerGroupName: j.runner_group_name ?? null,

    htmlUrl: j.html_url ?? '',
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    startedAt: j.started_at ?? null,

    completedAt: j.completed_at ?? null,
  }))

  // Get workflow run for database operations
  const workflowRun = await prisma.workflowRun.findUnique({
    where: { githubId: runId },
  })

  if (workflowRun) {
    // Save to database
    for (const job of jobs) {
      await prisma.workflowJob.upsert({
        where: { githubId: job.id },
        update: {
          name: job.name,
          status: job.status,
          conclusion: job.conclusion,
          runnerName: job.runnerName,
          runnerGroupName: job.runnerGroupName,
          htmlUrl: job.htmlUrl,
          startedAt: job.startedAt ? new Date(job.startedAt) : null,
          completedAt: job.completedAt ? new Date(job.completedAt) : null,
          lastSyncedAt: new Date(),
        },
        create: {
          githubId: job.id,
          workflowRunId: workflowRun.id,
          name: job.name,
          status: job.status,
          conclusion: job.conclusion,
          runnerName: job.runnerName,
          runnerGroupName: job.runnerGroupName,
          htmlUrl: job.htmlUrl,
          startedAt: job.startedAt ? new Date(job.startedAt) : null,
          completedAt: job.completedAt ? new Date(job.completedAt) : null,
          lastSyncedAt: new Date(),
        },
      })
    }
  }

  // Cache the result
  try {
    await redis.setex(cacheKey, CACHE_TTL.JOBS, JSON.stringify(jobs))
  } catch (error) {
    console.info('Failed to cache workflow jobs:', error)
  }

  return jobs
}

/**
 * Get workflow statistics (success rate, average duration, etc.)
 */
export async function getWorkflowStats(
  accessToken: string,
  cacheScope: string,
  owner: string,
  repo: string
): Promise<WorkflowStatsInfo> {
  const cacheKey = scopedCacheKey(cacheScope, `workflow-stats:${owner}/${repo}`)

  // Try to get from cache
  try {
    const cached = await redis.get(cacheKey)
    if (cached && typeof cached === 'string') {
      return JSON.parse(cached) as WorkflowStatsInfo
    }
  } catch (error) {
    console.info('Redis cache miss for workflow stats:', error)
  }

  // Fetch recent runs
  const { runs } = await getWorkflowRuns(accessToken, cacheScope, owner, repo, { perPage: 100 })

  // Calculate statistics
  const completedRuns = runs.filter((r) => r.status === 'completed')
  const successfulRuns = completedRuns.filter((r) => r.conclusion === 'success')
  const failedRuns = completedRuns.filter((r) => r.conclusion === 'failure')
  const cancelledRuns = completedRuns.filter((r) => r.conclusion === 'cancelled')

  const successRate =
    completedRuns.length > 0 ? (successfulRuns.length / completedRuns.length) * 100 : 0

  // Calculate average duration for completed runs
  let averageDuration: number | null = null
  const durations: number[] = []

  for (const run of completedRuns) {
    if (run.runStartedAt && run.updatedAt) {
      const duration = new Date(run.updatedAt).getTime() - new Date(run.runStartedAt).getTime()
      durations.push(duration)
    }
  }

  if (durations.length > 0) {
    const sum = durations.reduce((acc, d) => acc + d, 0)
    averageDuration = sum / durations.length
  }

  const stats: WorkflowStatsInfo = {
    totalRuns: runs.length,
    successfulRuns: successfulRuns.length,
    failedRuns: failedRuns.length,
    cancelledRuns: cancelledRuns.length,
    successRate,
    averageDuration,
    recentRuns: runs.slice(0, 10),
  }

  // Cache the result
  try {
    await redis.setex(cacheKey, CACHE_TTL.STATS, JSON.stringify(stats))
  } catch (error) {
    console.info('Failed to cache workflow stats:', error)
  }

  return stats
}
