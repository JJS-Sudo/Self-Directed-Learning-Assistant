import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Hono, type Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { serveStatic } from '@hono/node-server/serve-static'
import { createGoalSchema, formatZodError, toGoalListItem } from './api/goals.js'
import { buildHealthReport } from './api/health.js'
import {
  toEdgeDtos,
  candidatesSchema,
  chunkSizeFromEnv,
  createNodeSchema,
  layoutSchema,
  linkSchema,
  materialSchema,
  nodePatchSchema,
  toMapNodeDto,
} from './api/map.js'
import { commitResourcesSchema, previewResourcesSchema, toResourceDto } from './api/resources.js'
import {
  createRetrospectiveSchema,
  submitSessionSchema,
  toAssessmentDto,
  toRetrospectiveDto,
} from './api/assessments.js'
import { pathCommitSchema, toGeneratedStages, toQuestionDto, toStageDto } from './api/path.js'
import { createGoal, listGoals, requireGoal, setGoalBudget } from './domain/goals.js'
import { listAssessments, listSession, requireAssessment } from './domain/assessments.js'
import { listAllNodes, listNodes, requireNode } from './domain/nodes.js'
import { addLink, createNode, removeLink, updateNode } from './domain/nodes.js'
import { referencesOf, removeNode } from './domain/node-remove.js'
import { readLayout, writeLayout } from './domain/layout.js'
import { listStages } from './domain/path-stages.js'
import { readProfileOrDefault } from './domain/profile.js'
import { listQuestions } from './domain/questions.js'
import { listResourcesRanked } from './domain/resources.js'
import { createRetrospective, listRetrospectives } from './domain/retrospectives.js'
import { todayLocal } from './domain/validate.js'
import { readGoals } from './index-db/goals-index.js'
import { forceRebuild, withGoalsIndex } from './index-db/with-index.js'
import type { LlmDeps } from './llm/client.js'
import { resolveLlmConfig } from './llm/config.js'
import { LLM_HTTP_STATUS, LlmError, toLlmErrorBody } from './llm/errors.js'
import { pingLlm } from './llm/ping.js'
import { estimateCost } from './map-gen/estimate.js'
import { generateCandidates } from './map-gen/generate.js'
import { coverageWarnings, persistCandidates } from './map-gen/persist.js'
import { researchForGoal } from './map-gen/research.js'
import { generateSelfCandidates } from './map-gen/self.js'
import { estimatePath } from './path-gen/estimate.js'
import { generatePath } from './path-gen/generate.js'
import { persistPath } from './path-gen/persist.js'
import { previewResources } from './resource-search/preview.js'
import { persistResources } from './resource-search/persist.js'
import { submitSession } from './assessments/session.js'
import { summarizeSession } from './assessments/stats.js'
import {
  authMiddleware,
  clearAuthCookie,
  renderLoginPage,
  setAuthCookie,
  tokensMatch,
} from './server/auth.js'
import { buildQualityReport } from './quality/panel.js'
import { regenerateNodes } from './quality/regenerate.js'
import { budgetSchema, regenerateSchema } from './api/quality.js'
import { buildExportZip } from './export/zip.js'
import { importZip } from './import/zip.js'
import { keysView, updateKeysSchema } from './api/settings.js'
import { effectiveEnv, fileSecretsBackend, type SecretsBackend } from './settings/keys.js'
import { appendRun, costOf } from './runs/store.js'
import { SearchError, SEARCH_HTTP_STATUS, toSearchErrorBody } from './search/errors.js'
import { createTavilyProvider } from './search/tavily.js'
import { HTTP_STATUS, VaultError, messageOf, toErrorBody } from './vault/errors.js'
import { inspectVault, resolveVaultPath } from './vault/paths.js'
import { renderHome, type HomeViewData } from './views/home.js'
import { renderResources, type ResourcesViewData } from './views/resources.js'

/**
 * 网页的两条业务入口仍未变：
 * - `GET /`           总目标设定（`POST /goals` 建立目标）
 * - `GET /resources`  资源跳转站
 *
 * 另有两条非业务路由：
 * - `GET /healthz`    探针：永远 200，库状态只作信息返回
 * - `GET /api/health` 自检：库 / 索引 / 模型 / 版本，供页面与运维读（阶段 1 起）
 *
 * 传入 `webRoot` 时额外托管 `dist/web`：`/` 返回 SPA，非 `/api/*` 的路径回落 `index.html`。
 * 不传时行为与阶段 0 完全一致（旧的服务端渲染），因此既有测试不受构建产物影响。
 */

export interface AppOptions {
  /** 显式指定库根；缺省按 `SDL_VAULT_PATH` > `.sdlrc.json` > `./vault` 解析 */
  vaultPath?: string
  /** 已构建的前端目录（含 index.html）。缺省表示不托管网页，`/` 仍走旧的服务端渲染 */
  webRoot?: string
  /** 测试注入：LLM 客户端的 fetch / sleep / now */
  llmDeps?: Partial<LlmDeps>
  /** 测试注入：搜索提供方的 fetch */
  searchDeps?: { fetch?: typeof fetch }
  env?: NodeJS.ProcessEnv
  cwd?: string
  /** 非空时启用登录：cookie 或 Bearer 令牌 */
  accessToken?: string
  /** 可选：cookie 派生值的盐 */
  sessionSecret?: string
  /** 可选：密钥后端；桌面端注入 safeStorage 加密实现 */
  secrets?: SecretsBackend
}

export function createApp(options: AppOptions = {}): Hono {
  const app = new Hono()

  const resolveRoot = (): string =>
    options.vaultPath ?? resolveVaultPath({ env: options.env, cwd: options.cwd })

  /** 环境变量优先；页面里保存的 key 只在环境变量缺席时补位 */
  const runtimeEnv = (): NodeJS.ProcessEnv =>
    effectiveEnv(resolveRoot(), options.env ?? process.env, options.secrets)

  /** 每次 LLM 逻辑调用结束都记一条 run（成功/失败），用于费用与失败面板 */
  const recordedDeps = (root: string, goalId: string, kind: string): Partial<LlmDeps> => ({
    ...(options.llmDeps ?? {}),
    recorder: (event) => {
      try {
        const cost = costOf(event.usage)
        appendRun(root, {
          at: new Date().toISOString(),
          goalId,
          kind,
          ok: event.ok,
          ...(event.usage?.promptTokens === undefined
            ? {}
            : { promptTokens: event.usage.promptTokens }),
          ...(event.usage?.completionTokens === undefined
            ? {}
            : { completionTokens: event.usage.completionTokens }),
          ...(cost === undefined ? {} : { costCny: cost }),
          ...(event.durationMs === undefined ? {} : { durationMs: event.durationMs }),
          ...(event.error === undefined ? {} : { error: event.error }),
        })
      } catch {
        // 记录失败不影响主流程
      }
    },
  })

  // ─────────────────────── 登录（仅设了 token 时） ───────────────────────

  const accessToken = (options.accessToken ?? '').trim()
  const sessionSecret = options.sessionSecret ?? ''

  if (accessToken !== '') {
    app.use('*', authMiddleware(accessToken, sessionSecret))

    app.get('/login', (c) => c.html(renderLoginPage()))
    app.post('/login', async (c) => {
      const body = await c.req.parseBody()
      const submitted = typeof body['token'] === 'string' ? body['token'] : ''
      if (!tokensMatch(submitted, accessToken)) {
        return c.html(renderLoginPage('令牌不正确'), 401)
      }
      setAuthCookie(c, accessToken, sessionSecret)
      return c.redirect('/')
    })
    app.post('/logout', (c) => {
      clearAuthCookie(c)
      return c.redirect('/login')
    })
  }

  // ───────────────────────── 静态资源（可选） ─────────────────────────

  /** 构建产物不存在时退回旧行为，而不是让 `/` 变 404 */
  const indexHtml = options.webRoot === undefined ? null : readIndexHtml(options.webRoot)
  if (options.webRoot !== undefined) {
    app.use('/assets/*', serveStatic({ root: options.webRoot }))
  }

  // ───────────────────────────── 探针 ─────────────────────────────

  /** 存活探针：永远 200，库的状态作为信息返回（探针不该因为库没配好就挂） */
  app.get('/healthz', (c) => {
    try {
      return c.json({
        ok: true,
        service: 'self-directed-learning',
        vault: inspectVault(resolveRoot()),
      })
    } catch (error) {
      return c.json({
        ok: true,
        service: 'self-directed-learning',
        vault: null,
        vault_error: messageOf(error),
      })
    }
  })

  /** 自检：库 / 索引 / 模型 / 版本。任何异常都折进 200 的响应体，不抛 500 */
  app.get('/api/health', (c) => {
    // 库配置坏掉时 runtimeEnv 也会失败；自检本身不能因此变 500
    let env: NodeJS.ProcessEnv = options.env ?? process.env
    try {
      env = runtimeEnv()
    } catch {
      // 保留基础环境，继续走下面的错误分支
    }
    try {
      return c.json(buildHealthReport({ root: resolveRoot(), env }))
    } catch (error) {
      return c.json(buildHealthReport({ root: null, env, error: messageOf(error) }))
    }
  })

  // ───────────────────────── 目标 API（阶段 3） ─────────────────────────

  /** 列表读索引；新→旧（领域层是升序，倒序在 API 层做，见 D9） */
  app.get('/api/goals', (c) => {
    try {
      const { value: goals } = withGoalsIndex(resolveRoot(), (db) => readGoals(db))
      const today = todayLocal()
      return c.json({ goals: goals.map((goal) => toGoalListItem(goal, today)).reverse() })
    } catch (error) {
      return c.json({ error: toErrorBody(error) }, 500)
    }
  })

  /**
   * 先写 Markdown，再更新索引（索引只是缓存）。
   * 索引更新失败时返回 500 并明说「目标已创建」—— 不静默降级（mission R3）。
   */
  app.post('/api/goals', async (c) => {
    let payload: unknown
    try {
      payload = await c.req.json()
    } catch {
      return c.json({ error: { code: 'INVALID_INPUT', message: '请求体必须是合法 JSON' } }, 400)
    }

    const parsed = createGoalSchema.safeParse(payload)
    if (!parsed.success) {
      return c.json(
        { error: { code: 'INVALID_INPUT', message: formatZodError(parsed.error) } },
        400,
      )
    }

    let created
    try {
      const root = resolveRoot()
      created = createGoal({
        root,
        title: parsed.data.title,
        ...(parsed.data.kind === undefined ? {} : { kind: parsed.data.kind }),
        ...(parsed.data.deadline === undefined ? {} : { deadline: parsed.data.deadline }),
        ...(parsed.data.successCriteria === undefined
          ? {}
          : { successCriteria: parsed.data.successCriteria }),
      })

      try {
        withGoalsIndex(root, () => undefined)
      } catch (indexError) {
        return c.json(
          {
            error: {
              code: 'INDEX_UNAVAILABLE',
              message: `目标已创建（${created.id}），但索引更新失败：${messageOf(indexError)}`,
            },
          },
          500,
        )
      }
    } catch (error) {
      return c.json({ error: toErrorBody(error) }, errorStatus(error))
    }

    return c.json({ goal: toGoalListItem(created) }, 201)
  })

  // ─────────────────────── 模型自检（阶段 4） ───────────────────────

  /** 未配置时返回 200 `{configured:false}`，**不发起任何上游请求** */
  app.post('/api/llm/ping', async (c) => {
    const config = resolveLlmConfig(runtimeEnv())
    try {
      return c.json(await pingLlm(config, options.llmDeps))
    } catch (error) {
      if (error instanceof LlmError) {
        return c.json({ error: toLlmErrorBody(error) }, LLM_HTTP_STATUS[error.code])
      }
      return c.json({ error: toLlmErrorBody(error) }, 500)
    }
  })

  // ───────────────────── 知识地图（阶段 5） ─────────────────────

  /** 只做本地估算，**不调用模型** */
  app.post('/api/goals/:id/map/estimate', async (c) => {
    try {
      requireGoal(resolveRoot(), c.req.param('id'))
      const parsed = materialSchema.safeParse(await readJsonBody(c))
      if (!parsed.success) {
        return c.json(
          { error: { code: 'INVALID_INPUT', message: formatZodError(parsed.error) } },
          400,
        )
      }
      return c.json(
        estimateCost(parsed.data.material, {
          chunkSections: chunkSizeFromEnv(options.env ?? process.env),
        }),
      )
    } catch (error) {
      return c.json({ error: toErrorBody(error) }, errorStatus(error))
    }
  })

  /** 生成候选：只返回、**不落盘** */
  app.post('/api/goals/:id/map/ai', async (c) => {
    try {
      const root = resolveRoot()
      const goal = requireGoal(root, c.req.param('id'))
      const env = runtimeEnv()
      const research = await researchForGoal(goal, env)
      const result = await generateSelfCandidates(
        resolveLlmConfig(env),
        goal,
        research,
        recordedDeps(root, goal.id, '地图'),
      )
      return c.json({
        candidates: result.candidates,
        edges: toEdgeDtos(result.edges),
        warnings: result.warnings,
        research: { used: research.used, sources: research.sources },
        estimate: result.estimate,
      })
    } catch (error) {
      if (error instanceof LlmError) {
        return c.json({ error: toLlmErrorBody(error) }, LLM_HTTP_STATUS[error.code])
      }
      return c.json({ error: toErrorBody(error) }, errorStatus(error))
    }
  })

  /** 生成候选：只返回、**不落盘** */
  app.post('/api/goals/:id/map/preview', async (c) => {
    try {
      const root = resolveRoot()
      const goal = requireGoal(root, c.req.param('id'))
      const parsed = materialSchema.safeParse(await readJsonBody(c))
      if (!parsed.success) {
        return c.json(
          { error: { code: 'INVALID_INPUT', message: formatZodError(parsed.error) } },
          400,
        )
      }

      const env = runtimeEnv()
      const result = await generateCandidates(
        resolveLlmConfig(env),
        goal,
        parsed.data.material,
        { chunkSections: chunkSizeFromEnv(env) },
        recordedDeps(root, goal.id, '地图'),
      )

      return c.json({
        candidates: result.candidates,
        edges: toEdgeDtos(result.edges),
        warnings: result.warnings,
        estimate: result.estimate,
      })
    } catch (error) {
      if (error instanceof LlmError) {
        return c.json({ error: toLlmErrorBody(error) }, LLM_HTTP_STATUS[error.code])
      }
      return c.json({ error: toErrorBody(error) }, errorStatus(error))
    }
  })

  /** 确定性落盘：不调用模型 */
  app.post('/api/goals/:id/map/commit', async (c) => {
    try {
      const root = resolveRoot()
      const goal = requireGoal(root, c.req.param('id'))
      const parsed = candidatesSchema.safeParse(await readJsonBody(c))
      if (!parsed.success) {
        return c.json(
          { error: { code: 'INVALID_INPUT', message: formatZodError(parsed.error) } },
          400,
        )
      }
      return c.json(
        persistCandidates(
          root,
          goal.id,
          parsed.data.candidates,
          (parsed.data.edges ?? []).map((edge) => ({
            fromTempId: edge.from,
            toTempId: edge.to,
            type: edge.type,
          })),
        ),
      )
    } catch (error) {
      return c.json({ error: toErrorBody(error) }, errorStatus(error))
    }
  })

  app.get('/api/goals/:id/map', (c) => {
    try {
      const root = resolveRoot()
      const goal = requireGoal(root, c.req.param('id'))
      const nodes = listNodes(root, goal.id)
      return c.json({
        goal: {
          id: goal.id,
          title: goal.title,
          status: goal.status,
          ...(goal.deadline === undefined ? {} : { deadline: goal.deadline }),
          ...(goal.daysLeft === undefined ? {} : { daysLeft: goal.daysLeft }),
        },
        nodes: nodes.map(toMapNodeDto),
        layout: readLayout(root, goal),
        warnings: coverageWarnings(root, goal, nodes),
      })
    } catch (error) {
      return c.json({ error: toErrorBody(error) }, errorStatus(error))
    }
  })

  // ───────────────────── 知识网编辑（阶段 10 后补） ─────────────────────

  app.patch('/api/nodes/:id', async (c) => {
    try {
      const root = resolveRoot()
      const parsed = nodePatchSchema.safeParse(await readJsonBody(c))
      if (!parsed.success) {
        return c.json(
          { error: { code: 'INVALID_INPUT', message: formatZodError(parsed.error) } },
          400,
        )
      }
      const node = updateNode({ root, id: c.req.param('id'), ...parsed.data })
      return c.json({ node: toMapNodeDto(node) })
    } catch (error) {
      return c.json({ error: toErrorBody(error) }, errorStatus(error))
    }
  })

  app.post('/api/goals/:id/nodes', async (c) => {
    try {
      const root = resolveRoot()
      const goal = requireGoal(root, c.req.param('id'))
      const parsed = createNodeSchema.safeParse(await readJsonBody(c))
      if (!parsed.success) {
        return c.json(
          { error: { code: 'INVALID_INPUT', message: formatZodError(parsed.error) } },
          400,
        )
      }
      const node = createNode({
        root,
        title: parsed.data.title,
        goal: goal.id,
        ...(parsed.data.parentNodeId === undefined ? {} : { up: parsed.data.parentNodeId }),
      })
      return c.json({ node: toMapNodeDto(node) }, 201)
    } catch (error) {
      return c.json({ error: toErrorBody(error) }, errorStatus(error))
    }
  })

  app.delete('/api/nodes/:id', (c) => {
    try {
      const root = resolveRoot()
      const node = requireNode(root, c.req.param('id'))
      const references =
        node.goalId === undefined ? { stages: [], questions: [] } : referencesOf(root, node.id)
      const force = c.req.query('force') === '1'
      if (!force && (references.stages.length > 0 || references.questions.length > 0)) {
        return c.json(
          {
            error: {
              code: 'CONFLICT',
              message: '这个节点被路径段或题目引用；确认后加 force=1 删除',
            },
            references,
          },
          409,
        )
      }
      const result = removeNode(root, node.id)
      return c.json({ deleted: true, removedLinks: result.removedLinks, references })
    } catch (error) {
      return c.json({ error: toErrorBody(error) }, errorStatus(error))
    }
  })

  app.post('/api/goals/:id/map/links', async (c) => {
    try {
      const root = resolveRoot()
      const goal = requireGoal(root, c.req.param('id'))
      const parsed = linkSchema.safeParse(await readJsonBody(c))
      if (!parsed.success) {
        return c.json(
          { error: { code: 'INVALID_INPUT', message: formatZodError(parsed.error) } },
          400,
        )
      }
      const from = requireNode(root, parsed.data.from)
      const to = requireNode(root, parsed.data.to)
      if (from.goalId !== goal.id || to.goalId !== goal.id) {
        return c.json(
          { error: { code: 'INVALID_INPUT', message: '关系只能建在同一目标的知识网内' } },
          400,
        )
      }
      const node = addLink(root, from.id, to.id, parsed.data.type)
      return c.json({ node: toMapNodeDto(node) })
    } catch (error) {
      return c.json({ error: toErrorBody(error) }, errorStatus(error))
    }
  })

  app.delete('/api/goals/:id/map/links', (c) => {
    try {
      const root = resolveRoot()
      const goal = requireGoal(root, c.req.param('id'))
      const type = c.req.query('type')
      if (type !== 'parent' && type !== 'sibling' && type !== 'related') {
        return c.json({ error: { code: 'INVALID_INPUT', message: 'type 不合法' } }, 400)
      }
      const from = c.req.query('from')
      const to = c.req.query('to')
      if (from === undefined || to === undefined) {
        return c.json({ error: { code: 'INVALID_INPUT', message: '缺少 from/to' } }, 400)
      }
      const node = requireNode(root, from)
      if (node.goalId !== goal.id) {
        return c.json({ error: { code: 'INVALID_INPUT', message: '节点不属于该目标' } }, 400)
      }
      return c.json({ node: toMapNodeDto(removeLink(root, from, to, type)) })
    } catch (error) {
      return c.json({ error: toErrorBody(error) }, errorStatus(error))
    }
  })

  app.get('/api/goals/:id/map/layout', (c) => {
    try {
      const root = resolveRoot()
      const goal = requireGoal(root, c.req.param('id'))
      return c.json({ layout: readLayout(root, goal) })
    } catch (error) {
      return c.json({ error: toErrorBody(error) }, errorStatus(error))
    }
  })

  app.put('/api/goals/:id/map/layout', async (c) => {
    try {
      const root = resolveRoot()
      const goal = requireGoal(root, c.req.param('id'))
      const parsed = layoutSchema.safeParse(await readJsonBody(c))
      if (!parsed.success) {
        return c.json(
          { error: { code: 'INVALID_INPUT', message: formatZodError(parsed.error) } },
          400,
        )
      }
      return c.json({ layout: writeLayout(root, goal, parsed.data.positions) })
    } catch (error) {
      return c.json({ error: toErrorBody(error) }, errorStatus(error))
    }
  })

  // ───────────────────── 学习路径（阶段 6） ─────────────────────

  /** 只做本地估算，不调模型 */
  app.post('/api/goals/:id/path/estimate', (c) => {
    try {
      const root = resolveRoot()
      const goal = requireGoal(root, c.req.param('id'))
      return c.json(estimatePath(listNodes(root, goal.id)))
    } catch (error) {
      return c.json({ error: toErrorBody(error) }, errorStatus(error))
    }
  })

  /** 生成路径与题目：只返回候选，不落盘 */
  app.post('/api/goals/:id/path/preview', async (c) => {
    try {
      const root = resolveRoot()
      const goal = requireGoal(root, c.req.param('id'))
      const result = await generatePath(
        resolveLlmConfig(runtimeEnv()),
        goal,
        listNodes(root, goal.id),
        recordedDeps(root, goal.id, '路径'),
      )
      return c.json({ stages: result.stages, warnings: result.warnings, calls: result.calls })
    } catch (error) {
      if (error instanceof LlmError) {
        return c.json({ error: toLlmErrorBody(error) }, LLM_HTTP_STATUS[error.code])
      }
      return c.json({ error: toErrorBody(error) }, errorStatus(error))
    }
  })

  /** 确定性落盘：先题后段，order 接续 */
  app.post('/api/goals/:id/path/commit', async (c) => {
    try {
      const root = resolveRoot()
      const goal = requireGoal(root, c.req.param('id'))
      const parsed = pathCommitSchema.safeParse(await readJsonBody(c))
      if (!parsed.success) {
        return c.json(
          { error: { code: 'INVALID_INPUT', message: formatZodError(parsed.error) } },
          400,
        )
      }
      return c.json(persistPath(root, goal.id, toGeneratedStages(parsed.data)))
    } catch (error) {
      return c.json({ error: toErrorBody(error) }, errorStatus(error))
    }
  })

  app.get('/api/goals/:id/path', (c) => {
    try {
      const root = resolveRoot()
      const goal = requireGoal(root, c.req.param('id'))
      const stages = listStages(root, goal.id)
      const questions = listQuestions(root, goal.id)
      const byId = new Map(questions.map((question) => [question.id, question]))
      const ranked = listResourcesRanked(root)

      return c.json({
        stages: stages.map((stage) => ({
          ...toStageDto(stage),
          questions: stage.questionIds
            .map((id) => byId.get(id))
            .filter((question): question is NonNullable<typeof question> => question !== undefined)
            .map(toQuestionDto),
          resources: ranked
            .filter(
              (resource) =>
                resource.nodeId !== undefined && stage.nodeIds.includes(resource.nodeId),
            )
            .map((resource) => ({
              id: resource.id,
              title: resource.title,
              ...(resource.url === undefined ? {} : { url: resource.url }),
              ...(resource.platform === undefined ? {} : { platform: resource.platform }),
              ...(resource.price === undefined ? {} : { price: resource.price }),
              ...(resource.durationMin === undefined ? {} : { durationMin: resource.durationMin }),
              level: resource.level,
              media: resource.media,
            })),
        })),
        questions: stages
          .flatMap((stage) => stage.questionIds)
          .map((id) => byId.get(id))
          .filter((question): question is NonNullable<typeof question> => question !== undefined)
          .map(toQuestionDto),
        warnings: coverageWarnings(root, goal, listNodes(root, goal.id)),
      })
    } catch (error) {
      return c.json({ error: toErrorBody(error) }, errorStatus(error))
    }
  })

  // ───────────────────── 资源检索（阶段 7） ─────────────────────

  app.post('/api/goals/:id/resources/preview', async (c) => {
    try {
      const root = resolveRoot()
      const goal = requireGoal(root, c.req.param('id'))
      const parsed = previewResourcesSchema.safeParse(await readJsonBody(c))
      if (!parsed.success) {
        return c.json(
          { error: { code: 'INVALID_INPUT', message: formatZodError(parsed.error) } },
          400,
        )
      }

      const env = runtimeEnv()
      const config = resolveLlmConfig(env)
      if (config.apiKey === undefined) {
        throw new LlmError('LLM_NOT_CONFIGURED', '未配置 DEEPSEEK_API_KEY')
      }
      if ((env['TAVILY_API_KEY'] ?? '').trim() === '') {
        throw new SearchError('SEARCH_NOT_CONFIGURED', '未配置 TAVILY_API_KEY')
      }

      const byId = new Map(listNodes(root, goal.id).map((node) => [node.id, node]))
      const selected = parsed.data.nodeIds.map((id) => {
        const node = byId.get(id)
        if (node === undefined) {
          throw new VaultError('INVALID_INPUT', `节点不属于该目标：${id}`)
        }
        return node
      })

      const result = await previewResources({
        config,
        goal,
        nodes: selected,
        profile: readProfileOrDefault(root),
        search: createTavilyProvider({
          env,
          ...(options.searchDeps?.fetch === undefined
            ? {}
            : { fetchImpl: options.searchDeps.fetch }),
        }),
        deps: recordedDeps(root, goal.id, '资源'),
      })
      return c.json(result)
    } catch (error) {
      if (error instanceof SearchError) {
        return c.json({ error: toSearchErrorBody(error) }, SEARCH_HTTP_STATUS[error.code])
      }
      if (error instanceof LlmError) {
        return c.json({ error: toLlmErrorBody(error) }, LLM_HTTP_STATUS[error.code])
      }
      return c.json({ error: toErrorBody(error) }, errorStatus(error))
    }
  })

  app.post('/api/goals/:id/resources/commit', async (c) => {
    try {
      const root = resolveRoot()
      const goal = requireGoal(root, c.req.param('id'))
      const parsed = commitResourcesSchema.safeParse(await readJsonBody(c))
      if (!parsed.success) {
        return c.json(
          { error: { code: 'INVALID_INPUT', message: formatZodError(parsed.error) } },
          400,
        )
      }
      return c.json(persistResources(root, goal.id, parsed.data.resources))
    } catch (error) {
      return c.json({ error: toErrorBody(error) }, errorStatus(error))
    }
  })

  app.get('/api/goals/:id/resources', (c) => {
    try {
      const root = resolveRoot()
      const goal = requireGoal(root, c.req.param('id'))
      const nodes = listNodes(root, goal.id)
      const titles = new Map(listAllNodes(root).map((node) => [node.id, node.title]))
      const profile = readProfileOrDefault(root)

      return c.json({
        resources: listResourcesRanked(root, { nodeIds: nodes.map((node) => node.id) }).map(
          (resource) => toResourceDto(resource, (id) => titles.get(id) ?? id),
        ),
        profile: {
          level: profile.level,
          mediaPreference: profile.mediaPreference,
          timeBudget: profile.timeBudget,
        },
      })
    } catch (error) {
      return c.json({ error: toErrorBody(error) }, errorStatus(error))
    }
  })

  // ───────────────────── 验收与复盘（阶段 8） ─────────────────────

  app.post('/api/goals/:id/assessments', async (c) => {
    try {
      const root = resolveRoot()
      const goal = requireGoal(root, c.req.param('id'))
      const parsed = submitSessionSchema.safeParse(await readJsonBody(c))
      if (!parsed.success) {
        return c.json(
          { error: { code: 'INVALID_INPUT', message: formatZodError(parsed.error) } },
          400,
        )
      }

      const result = submitSession({ root, goalId: goal.id, ...parsed.data })
      return c.json({
        sessionId: result.sessionId,
        records: result.records.map(toAssessmentDto),
        stats: result.stats,
      })
    } catch (error) {
      return c.json({ error: toErrorBody(error) }, errorStatus(error))
    }
  })

  app.get('/api/goals/:id/assessments', (c) => {
    try {
      const root = resolveRoot()
      const goal = requireGoal(root, c.req.param('id'))
      const session = c.req.query('session')

      const records =
        session === undefined
          ? listAssessments(root, { goalId: goal.id }).slice(0, 50)
          : listSession(root, session).filter(
              (record) => record.goalId === undefined || record.goalId === goal.id,
            )
      return c.json({
        records: records.map(toAssessmentDto),
        ...(session === undefined ? {} : { stats: summarizeSession(records) }),
      })
    } catch (error) {
      return c.json({ error: toErrorBody(error) }, errorStatus(error))
    }
  })

  app.post('/api/goals/:id/retrospectives', async (c) => {
    try {
      const root = resolveRoot()
      const goal = requireGoal(root, c.req.param('id'))
      const parsed = createRetrospectiveSchema.safeParse(await readJsonBody(c))
      if (!parsed.success) {
        return c.json(
          { error: { code: 'INVALID_INPUT', message: formatZodError(parsed.error) } },
          400,
        )
      }

      const assessment = requireAssessment(root, parsed.data.assessmentId)
      if (assessment.goalId !== goal.id) {
        throw new VaultError('INVALID_INPUT', '验收记录不属于该目标')
      }

      const retro = createRetrospective({
        root,
        assessment: assessment.id,
        worked: parsed.data.worked,
        failed: parsed.data.failed,
        nextAdjustment: parsed.data.nextAdjustment,
        ...(parsed.data.stageIds === undefined ? {} : { adjustEvents: parsed.data.stageIds }),
        ...(parsed.data.mastery === undefined ? {} : { mastery: parsed.data.mastery }),
      })

      return c.json({
        id: retro.id,
        adjustEventIds: retro.adjustEventIds,
        ...(parsed.data.mastery === undefined ? {} : { mastery: parsed.data.mastery }),
      })
    } catch (error) {
      return c.json({ error: toErrorBody(error) }, errorStatus(error))
    }
  })

  app.get('/api/goals/:id/retrospectives', (c) => {
    try {
      const root = resolveRoot()
      const goal = requireGoal(root, c.req.param('id'))
      return c.json({
        retrospectives: listRetrospectives(root, { goalId: goal.id }).map(toRetrospectiveDto),
      })
    } catch (error) {
      return c.json({ error: toErrorBody(error) }, errorStatus(error))
    }
  })

  // ───────────────────── 质量与费用（阶段 10） ─────────────────────

  app.get('/api/goals/:id/quality', (c) => {
    try {
      const root = resolveRoot()
      const goal = requireGoal(root, c.req.param('id'))
      return c.json(buildQualityReport(root, goal))
    } catch (error) {
      return c.json({ error: toErrorBody(error) }, errorStatus(error))
    }
  })

  app.post('/api/goals/:id/budget', async (c) => {
    try {
      const root = resolveRoot()
      const goal = requireGoal(root, c.req.param('id'))
      const parsed = budgetSchema.safeParse(await readJsonBody(c))
      if (!parsed.success) {
        return c.json(
          { error: { code: 'INVALID_INPUT', message: formatZodError(parsed.error) } },
          400,
        )
      }
      const updated = setGoalBudget(root, goal.id, parsed.data.budgetCny)
      return c.json({
        goal: {
          id: updated.id,
          ...(updated.budgetCny === undefined ? {} : { budgetCny: updated.budgetCny }),
        },
      })
    } catch (error) {
      return c.json({ error: toErrorBody(error) }, errorStatus(error))
    }
  })

  app.post('/api/goals/:id/regenerate', async (c) => {
    try {
      const root = resolveRoot()
      const goal = requireGoal(root, c.req.param('id'))
      const parsed = regenerateSchema.safeParse(await readJsonBody(c))
      if (!parsed.success) {
        return c.json(
          { error: { code: 'INVALID_INPUT', message: formatZodError(parsed.error) } },
          400,
        )
      }
      const env = runtimeEnv()
      const result = await regenerateNodes(
        resolveLlmConfig(env),
        goal,
        listNodes(root, goal.id),
        parsed.data.nodeIds,
        recordedDeps(root, goal.id, '重生成'),
      )
      return c.json(result)
    } catch (error) {
      if (error instanceof LlmError) {
        return c.json({ error: toLlmErrorBody(error) }, LLM_HTTP_STATUS[error.code])
      }
      return c.json({ error: toErrorBody(error) }, errorStatus(error))
    }
  })

  // ───────────────────── 导出 / 导入（阶段 10） ─────────────────────

  app.get('/api/export', async (c) => {
    try {
      const root = resolveRoot()
      const goalId = c.req.query('goalId')
      if (goalId !== undefined && goalId !== '') requireGoal(root, goalId)
      const zip = await buildExportZip(root, {
        ...(goalId === undefined || goalId === '' ? {} : { goalId }),
        includeCanvas: c.req.query('canvas') === '1',
      })
      return new Response(new Uint8Array(zip), {
        headers: {
          'content-type': 'application/zip',
          'content-disposition': 'attachment; filename="sdl-export.zip"',
        },
      })
    } catch (error) {
      return c.json({ error: toErrorBody(error) }, errorStatus(error))
    }
  })

  app.post('/api/import', async (c) => {
    try {
      const root = resolveRoot()
      const buffer = Buffer.from(await c.req.arrayBuffer())
      const result = await importZip(root, buffer)
      forceRebuild(root)
      return c.json(result)
    } catch (error) {
      return c.json({ error: toErrorBody(error) }, errorStatus(error))
    }
  })

  // ───────────────────── 设置：API Key（阶段 10 后补） ─────────────────────

  app.get('/api/settings/keys', (c) => {
    try {
      return c.json(keysView(resolveRoot(), options.env ?? process.env, options.secrets))
    } catch (error) {
      return c.json({ error: toErrorBody(error) }, errorStatus(error))
    }
  })

  app.put('/api/settings/keys', async (c) => {
    try {
      const root = resolveRoot()
      const parsed = updateKeysSchema.safeParse(await readJsonBody(c))
      if (!parsed.success) {
        return c.json(
          { error: { code: 'INVALID_INPUT', message: formatZodError(parsed.error) } },
          400,
        )
      }
      const backend = options.secrets ?? fileSecretsBackend(root)
      backend.write(parsed.data)
      return c.json(keysView(root, options.env ?? process.env, backend))
    } catch (error) {
      return c.json({ error: toErrorBody(error) }, errorStatus(error))
    }
  })

  // ─────────────────────── 入口一：总目标设定 ───────────────────────

  app.get('/', (c) => {
    if (indexHtml !== null) return c.html(indexHtml)

    const notice = c.req.query('notice')
    return renderGoalsPage(c, resolveRoot, {
      ...(notice !== undefined && notice !== '' ? { notice } : {}),
    })
  })

  app.post('/goals', async (c) => {
    const form = await readForm(c)
    try {
      const goal = createGoal({
        root: resolveRoot(),
        title: form['title'] ?? '',
        kind: form['kind'],
        deadline: form['deadline'],
        successCriteria: form['success_criteria'],
      })
      const message =
        goal.kind === '激励性'
          ? `激励性目标「${goal.title}」已建立，期限 ${goal.deadline}（还剩 ${goal.daysLeft} 天）`
          : `目标「${goal.title}」已建立`
      return c.redirect(`/?notice=${encodeURIComponent(message)}`, 303)
    } catch (error) {
      return renderGoalsPage(c, resolveRoot, {
        error: messageOf(error),
        status: errorStatus(error),
      })
    }
  })

  // ─────────────────────── 入口二：资源跳转站 ───────────────────────

  app.get('/resources', (c) => {
    // 有构建产物时交给 SPA（阶段 2 起「资源」是六区之一）；没有时回落旧页面
    if (indexHtml !== null) return c.html(indexHtml)

    const goalId = c.req.query('goal')
    const notice = c.req.query('notice')
    return renderResourcesPage(c, resolveRoot, {
      ...(goalId !== undefined && goalId !== '' ? { selectedGoalId: goalId } : {}),
      ...(notice !== undefined && notice !== '' ? { notice } : {}),
    })
  })

  // ───────────────────────── SPA 回落（可选） ─────────────────────────

  /**
   * 托管前端时，未知路径交给 SPA 路由（刷新不 404）。
   * `/api/*` 例外：未知接口仍是 JSON 404，避免前端把接口错误当成页面。
   */
  if (indexHtml !== null) {
    app.get('*', (c) => (c.req.path.startsWith('/api/') ? c.notFound() : c.html(indexHtml)))
  }

  // ───────────────────────────── 兜底 ─────────────────────────────

  /** 删掉的路由（`/questions`、`/api/*` …）一律 404 —— 这是"只剩两个功能"的判据 */
  app.notFound((c) =>
    c.json({ error: { code: 'NOT_FOUND', message: `没有这个路由：${c.req.path}` } }, 404),
  )

  app.onError((error, c) => {
    if (error instanceof VaultError) {
      return c.json({ error: toErrorBody(error) }, HTTP_STATUS[error.code])
    }
    return c.json({ error: toErrorBody(error) }, 500)
  })

  return app
}

interface PageOptions {
  selectedGoalId?: string
  notice?: string
  error?: string
  status?: ContentfulStatusCode
}

/**
 * 渲染总目标设定页。库不可用（缺标记、路径解析失败）时**不返回 500** ——
 * 页面本身渲染成功，把库的错误作为内容显示出来，对使用者更有用。
 */
function renderGoalsPage(c: Context, resolveRoot: () => string, options: PageOptions = {}) {
  let data: HomeViewData = { goals: [] }
  let error = options.error

  try {
    data = { goals: listGoals(resolveRoot()) }
  } catch (cause) {
    error = error ?? messageOf(cause)
  }

  return c.html(
    renderHome({
      ...data,
      ...(options.notice !== undefined ? { notice: options.notice } : {}),
      ...(error !== undefined ? { error } : {}),
    }),
    options.status ?? 200,
  )
}

/** 渲染资源跳转站：按目标筛选（只读，不提供录入表单） */
function renderResourcesPage(c: Context, resolveRoot: () => string, options: PageOptions = {}) {
  let data: ResourcesViewData = { goals: [], nodes: [], resources: [] }
  let error = options.error

  try {
    const root = resolveRoot()
    const goals = listGoals(root)
    const requested = options.selectedGoalId
    const activeGoalId =
      requested !== undefined && goals.some((goal) => goal.id === requested) ? requested : undefined

    const nodes = activeGoalId === undefined ? listAllNodes(root) : listNodes(root, activeGoalId)
    const nodeIds = nodes.map((node) => node.id)

    data = {
      goals,
      nodes,
      resources: listResourcesRanked(root, activeGoalId === undefined ? {} : { nodeIds }),
      ...(activeGoalId !== undefined ? { selectedGoalId: activeGoalId } : {}),
    }
  } catch (cause) {
    error = error ?? messageOf(cause)
  }

  return c.html(
    renderResources({
      ...data,
      ...(options.notice !== undefined ? { notice: options.notice } : {}),
      ...(error !== undefined ? { error } : {}),
    }),
    options.status ?? 200,
  )
}

/** 表单提交失败时的状态码：沿用"错误码 → 状态码"的统一映射，而不是一律 400 */
function errorStatus(error: unknown): ContentfulStatusCode {
  return error instanceof VaultError ? HTTP_STATUS[error.code] : 500
}

/** 读取构建产物的 index.html；缺失时返回 null，调用方回落到旧行为 */
function readIndexHtml(webRoot: string): string | null {
  try {
    return readFileSync(join(webRoot, 'index.html'), 'utf8')
  } catch {
    return null
  }
}

async function readForm(c: Context): Promise<Record<string, string>> {
  const body = await c.req.parseBody()
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'string') out[key] = value
  }
  return out
}

/** JSON 请求体：解析失败返回 undefined，交给 zod 报「类型不对」 */
async function readJsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json()
  } catch {
    return undefined
  }
}
