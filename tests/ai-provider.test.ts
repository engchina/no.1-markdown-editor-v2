import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildAIOracleMCPConfigJson,
  buildHostedAgentInvokeUrlPreview,
  buildHostedAgentTokenUrlPreview,
  getDefaultStructuredStoreRegistration,
  getDefaultUnstructuredStoreRegistration,
  normalizeAIProviderConfig,
  parseAIOracleMCPConfigJson,
} from '../src/lib/ai/provider.ts'
import { getAIDocumentThreadKey, parseAIDocumentThreadKey } from '../src/lib/ai/thread.ts'

test('normalizeAIProviderConfig trims and validates openai-compatible settings', () => {
  const config = normalizeAIProviderConfig({
    provider: 'openai-compatible',
    baseUrl: ' https://example.com/v1/ ',
    model: ' gpt-test ',
    project: '  project-123  ',
  })

  assert.deepEqual(config, {
    provider: 'openai-compatible',
    baseUrl: 'https://example.com/v1',
    model: 'gpt-test',
    project: 'project-123',
  })
})

test('normalizeAIProviderConfig accepts oci-responses with empty project', () => {
  const config = normalizeAIProviderConfig({
    provider: 'oci-responses',
    baseUrl: 'https://example.com/v1',
    model: 'model-x',
    project: '',
    unstructuredStores: [],
    structuredStores: [],
    hostedAgentProfiles: [],
  })

  assert.equal(config.provider, 'oci-responses')
  assert.equal(config.project, '')
})

test('normalizeAIProviderConfig normalizes hosted agent profile defaults', () => {
  const config = normalizeAIProviderConfig({
    provider: 'oci-responses',
    baseUrl: 'https://example.com/v1',
    model: 'model-x',
    project: '',
    unstructuredStores: [],
    structuredStores: [],
    hostedAgentProfiles: [
      {
        id: 'hosted-agent-1',
        label: 'Travel Agent',
        ociRegion: ' us-chicago-1 ',
        hostedApplicationOcid: ' ocid1.generativeaihostedapplication.oc1..demo ',
        apiVersion: ' ',
        apiAction: ' /chat/ ',
        domainUrl: 'https://idcs.example.com',
        clientId: ' client-id ',
        scope: ' https://k8scloud.site/invoke ',
        transport: 'http-json',
      },
    ],
  })

  assert.equal(config.provider, 'oci-responses')
  assert.deepEqual(config.hostedAgentProfiles, [
    {
      id: 'hosted-agent-1',
      label: 'Travel Agent',
      ociRegion: 'us-chicago-1',
      hostedApplicationOcid: 'ocid1.generativeaihostedapplication.oc1..demo',
      apiVersion: '20251112',
      apiAction: 'chat',
      domainUrl: 'https://idcs.example.com',
      clientId: 'client-id',
      scope: 'https://k8scloud.site/invoke',
      transport: 'http-json',
    },
  ])
})

test('normalizeAIProviderConfig preserves OCI auth, structured store, enrichment, and MCP execution bindings', () => {
  const mcpJson = JSON.stringify({
    mcpServers: {
      nl2sql_sales_database: {
        description: 'NL2SQL MCP server',
        command: '/opt/homebrew/bin/npx',
        args: [
          '-y',
          'mcp-remote',
          'https://genai.oci.us-chicago-1.oraclecloud.com/nl2sql/toolchain',
          '--allow-http',
        ],
        transport: 'streamable-http',
      },
    },
  })

  const config = normalizeAIProviderConfig({
    provider: 'oci-responses',
    baseUrl: ' https://genai.oci.us-chicago-1.oraclecloud.com/openai/v1/ ',
    model: ' cohere.command-r-plus ',
    project: '',
    ociAuthProfiles: [
      {
        id: 'oci-default',
        label: ' Default ',
        configFile: ' ~/.oci/config ',
        profile: ' DEFAULT ',
        region: ' us-chicago-1 ',
        tenancy: ' ocid1.tenancy.oc1..demo ',
        user: ' ocid1.user.oc1..demo ',
        fingerprint: ' aa:bb ',
        keyFile: ' ~/.oci/key.pem ',
        enabled: true,
      },
    ],
    unstructuredStores: [],
    structuredStores: [
      {
        id: 'sales-store',
        label: ' Sales ',
        semanticStoreId: ' semantic-ocid ',
        compartmentId: ' ocid1.compartment.oc1..sales ',
        storeOcid: '',
        ociAuthProfileId: 'oci-default',
        regionOverride: ' us-ashburn-1 ',
        schemaName: ' SALES ',
        description: ' ',
        enabled: true,
        isDefault: true,
        defaultMode: 'agent-answer',
        executionProfileId: 'mcp-sales',
        enrichmentDefaultMode: 'partial',
        enrichmentObjectNames: ' ORDERS\nCUSTOMERS ',
      },
    ],
    mcpExecutionProfiles: [
      {
        id: 'mcp-sales',
        label: ' Sales MCP ',
        description: ' NL2SQL MCP server ',
        configJson: mcpJson,
        command: ' /opt/homebrew/bin/npx ',
        args: [' -y ', ' mcp-remote ', ' https://genai.oci.us-chicago-1.oraclecloud.com/nl2sql/toolchain ', ' --allow-http '],
        serverUrl: ' https://genai.oci.us-chicago-1.oraclecloud.com/nl2sql/toolchain ',
        transport: 'streamable-http',
        toolName: ' query_sales_database ',
        enabled: true,
      },
    ],
    hostedAgentProfiles: [],
  })

  assert.equal(config.provider, 'oci-responses')
  assert.equal(config.ociAuthProfiles[0]?.configFile, '~/.oci_iam/config')
  assert.equal(config.ociAuthProfiles[0]?.profile, 'DEFAULT')
  assert.equal(config.mcpExecutionProfiles[0]?.transport, 'streamable-http')
  assert.equal(config.mcpExecutionProfiles[0]?.toolName, 'query_sales_database')
  assert.equal(config.structuredStores[0]?.isDefault, true)
  assert.equal(config.structuredStores[0]?.defaultMode, 'agent-answer')
  assert.equal(config.structuredStores[0]?.compartmentId, 'ocid1.compartment.oc1..sales')
  assert.equal(config.structuredStores[0]?.ociAuthProfileId, 'oci-default')
  assert.equal(config.structuredStores[0]?.executionProfileId, 'mcp-sales')
  assert.equal(config.structuredStores[0]?.schemaName, 'SALES')
  assert.equal(config.structuredStores[0]?.enrichmentDefaultMode, 'partial')
  assert.equal(config.structuredStores[0]?.enrichmentObjectNames, 'ORDERS\nCUSTOMERS')
})

test('default store helpers prefer explicit enabled defaults and normalize duplicate structured defaults', () => {
  const config = normalizeAIProviderConfig({
    provider: 'oci-responses',
    baseUrl: 'https://example.com/v1',
    model: 'model-x',
    project: '',
    ociAuthProfiles: [],
    unstructuredStores: [
      {
        id: 'docs-first',
        label: 'Docs First',
        vectorStoreId: 'vs_first',
        description: '',
        enabled: true,
        isDefault: false,
      },
      {
        id: 'docs-default',
        label: 'Docs Default',
        vectorStoreId: 'vs_default',
        description: '',
        enabled: true,
        isDefault: true,
      },
    ],
    structuredStores: [
      {
        id: 'data-first',
        label: 'Data First',
        semanticStoreId: 'semantic-first',
        compartmentId: '',
        storeOcid: '',
        ociAuthProfileId: null,
        regionOverride: '',
        schemaName: '',
        description: '',
        enabled: true,
        isDefault: true,
        defaultMode: 'sql-draft',
        executionProfileId: null,
        enrichmentDefaultMode: 'full',
        enrichmentObjectNames: '',
      },
      {
        id: 'data-duplicate-default',
        label: 'Data Duplicate Default',
        semanticStoreId: 'semantic-duplicate',
        compartmentId: '',
        storeOcid: '',
        ociAuthProfileId: null,
        regionOverride: '',
        schemaName: '',
        description: '',
        enabled: true,
        isDefault: true,
        defaultMode: 'agent-answer',
        executionProfileId: null,
        enrichmentDefaultMode: 'full',
        enrichmentObjectNames: '',
      },
    ],
    mcpExecutionProfiles: [],
    hostedAgentProfiles: [],
  })

  assert.equal(config.provider, 'oci-responses')
  assert.equal(getDefaultUnstructuredStoreRegistration(config)?.id, 'docs-default')
  assert.equal(getDefaultStructuredStoreRegistration(config)?.id, 'data-first')
  assert.equal(config.structuredStores[0]?.isDefault, true)
  assert.equal(config.structuredStores[1]?.isDefault, false)
})

test('MCP JSON import and export map Oracle Console server config to execution profiles', () => {
  const imported = parseAIOracleMCPConfigJson(
    JSON.stringify({
      mcpServers: {
        nl2sql_sales_database: {
          description: 'NL2SQL MCP server for sales',
          command: '/opt/homebrew/bin/npx',
          args: [
            '-y',
            'mcp-remote',
            'https://genai.oci.us-chicago-1.oraclecloud.com/nl2sql/toolchain',
            '--allow-http',
          ],
          transport: 'streamable-http',
        },
      },
    })
  )

  assert.equal(imported.label, 'nl2sql_sales_database')
  assert.equal(imported.command, '/opt/homebrew/bin/npx')
  assert.equal(imported.serverUrl, 'https://genai.oci.us-chicago-1.oraclecloud.com/nl2sql/toolchain')
  assert.equal(imported.transport, 'streamable-http')

  const exported = JSON.parse(
    buildAIOracleMCPConfigJson({
      id: 'mcp-sales',
      label: imported.label,
      description: imported.description,
      command: imported.command,
      args: imported.args,
      transport: imported.transport,
    })
  )
  assert.deepEqual(exported.mcpServers.nl2sql_sales_database.args, imported.args)
  assert.equal(exported.mcpServers.nl2sql_sales_database.transport, 'streamable-http')
})

test('normalizeAIProviderConfig defaults apiAction to chat when blank', () => {
  const config = normalizeAIProviderConfig({
    provider: 'oci-responses',
    baseUrl: 'https://example.com/v1',
    model: 'model-x',
    project: '',
    unstructuredStores: [],
    structuredStores: [],
    hostedAgentProfiles: [
      {
        id: 'hosted-agent-1',
        label: 'Travel Agent',
        ociRegion: 'us-chicago-1',
        hostedApplicationOcid: 'ocid1.generativeaihostedapplication.oc1..demo',
        apiVersion: '20251112',
        apiAction: '',
        domainUrl: 'https://idcs.example.com',
        clientId: 'client-id',
        scope: 'scope',
        transport: 'http-json',
      },
    ],
  })

  assert.equal(config.provider, 'oci-responses')
  assert.equal(
    config.provider === 'oci-responses' ? config.hostedAgentProfiles[0]?.apiAction : null,
    'chat'
  )
})

test('normalizeAIProviderConfig rejects hosted agent profiles missing OCI identifiers', () => {
  assert.throws(
    () =>
      normalizeAIProviderConfig({
        provider: 'oci-responses',
        baseUrl: 'https://example.com/v1',
        model: 'model-x',
        project: '',
        unstructuredStores: [],
        structuredStores: [],
        hostedAgentProfiles: [
          {
            id: 'hosted-agent-1',
            label: 'Travel Agent',
            ociRegion: '',
            hostedApplicationOcid: '',
            apiVersion: '',
            apiAction: 'chat',
            domainUrl: 'https://idcs.example.com',
            clientId: 'client-id',
            scope: 'https://k8scloud.site/invoke',
            transport: 'http-json',
          },
        ],
      }),
    /Hosted agent OCI region is required/u
  )
})

test('normalizeAIProviderConfig rejects invalid base URLs', () => {
  assert.throws(
    () =>
      normalizeAIProviderConfig({
        provider: 'openai-compatible',
        baseUrl: 'ftp://example.com',
        model: 'model',
        project: '',
      }),
    /HTTP or HTTPS/u
  )
})

test('buildHostedAgentTokenUrlPreview normalizes the token endpoint URL', () => {
  assert.equal(
    buildHostedAgentTokenUrlPreview(' https://idcs.example.com/ '),
    'https://idcs.example.com/oauth2/v1/token'
  )
  assert.equal(buildHostedAgentTokenUrlPreview(''), '')
})

test('buildHostedAgentInvokeUrlPreview composes the hosted invoke URL from profile fields', () => {
  assert.equal(
    buildHostedAgentInvokeUrlPreview({
      ociRegion: ' us-chicago-1 ',
      hostedApplicationOcid: ' ocid1.generativeaihostedapplication.oc1..demo ',
      apiVersion: ' ',
      apiAction: ' /chat/ ',
    }),
    'https://application.generativeai.us-chicago-1.oci.oraclecloud.com/20251112/hostedApplications/ocid1.generativeaihostedapplication.oc1..demo/actions/invoke/chat'
  )
  assert.equal(
    buildHostedAgentInvokeUrlPreview({
      ociRegion: '',
      hostedApplicationOcid: 'ocid1.generativeaihostedapplication.oc1..demo',
      apiVersion: '20251112',
      apiAction: 'chat',
    }),
    ''
  )
})

test('getAIDocumentThreadKey uses path for saved files and tab id for drafts', () => {
  assert.equal(getAIDocumentThreadKey('tab-1', 'notes\\demo.md'), 'path:notes/demo.md')
  assert.equal(getAIDocumentThreadKey('draft-1', null), 'draft:draft-1')
})

test('parseAIDocumentThreadKey understands saved-path and draft thread keys', () => {
  assert.deepEqual(parseAIDocumentThreadKey('path:notes/demo.md'), { kind: 'path', value: 'notes/demo.md' })
  assert.deepEqual(parseAIDocumentThreadKey('draft:draft-1'), { kind: 'draft', value: 'draft-1' })
  assert.equal(parseAIDocumentThreadKey('invalid-key'), null)
})
