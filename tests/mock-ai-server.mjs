import http from 'node:http'

const port = Number(process.env.MOCK_AI_PORT || 8787)

const optimizationBasis = {
  fitSummary: '候选人的产品增长与数据分析经历和目标岗位高度匹配。',
  fitScore: 88,
  matchedAdvantages: ['具备完整的增长产品实践', '能够使用数据验证产品方案'],
  weakPoints: ['行业经验仍需在面试中补充说明'],
  transferableExperience: ['跨团队推动复杂项目落地'],
  keywordStrategy: ['用户增长', 'A/B 测试', '转化率优化'],
  rewriteStrategy: ['优先突出直播间商品卡片项目'],
  riskNotes: ['仅使用简历中已有的量化指标'],
}

const introduction = [
  '您好，我叫张明，是一名拥有 6 年互联网产品经验的产品经理，主要聚焦电商场景下的用户增长和体验优化。',
  '过去的工作中，我参与过多个从 0 到 1 以及持续迭代的产品项目，也积累了数据分析和跨团队协作经验。最想重点介绍的是我负责的直播间商品卡片项目。我从用户调研和漏斗分析出发，识别信息密度和推荐相关性问题，推动产品、设计、研发与运营共同完成方案落地，并通过多轮 A/B 测试持续验证和优化。',
  '这段经历让我形成了以用户价值为起点、用数据验证决策、并推动复杂项目高质量落地的工作方式。我希望把这些经验应用到目标岗位中，为业务增长和用户体验创造更大价值。谢谢。',
].join('\n\n')

const resume = `# 张明

电话：138-0000-0000 | 邮箱：zhangming@example.com

## 求职意向
---

高级产品经理

## 个人优势
---

- 6 年互联网产品经验，聚焦用户增长与体验优化
- 熟悉数据分析、A/B 测试和跨团队项目推进

## 工作经历
---

**示例科技 | 高级产品经理**
2021.06 - 至今
- 负责直播间商品卡片产品设计与持续迭代
- 通过用户研究和数据分析优化核心转化路径`

const server = http.createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')

  if (request.method === 'OPTIONS') {
    response.writeHead(204)
    response.end()
    return
  }

  if (request.method !== 'POST' || request.url !== '/chat/completions') {
    response.writeHead(404)
    response.end('Not found')
    return
  }

  let body = ''
  request.setEncoding('utf8')
  request.on('data', (chunk) => {
    body += chunk
  })
  request.on('end', () => {
    const payload = JSON.parse(body || '{}')
    const prompt = payload.messages?.[0]?.content || ''
    const content = prompt.includes('只输出自我介绍正文')
      ? introduction
      : prompt.includes('"fitSummary"')
        ? JSON.stringify(optimizationBasis)
        : resume

    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify({
      choices: [{ message: { content } }],
    }))
  })
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Mock AI server listening on http://127.0.0.1:${port}`)
})
