// REST
export { RestClient, encodeForm } from './rest/rest-client';
export type { RestClientOptions, RestRequest } from './rest/rest-client';

// Webhooks
export {
  verifyHmacSignature,
  verifyBachsSignature,
  verifyGithubSignature,
  hmacSha256Hex,
} from './webhooks/signature';

// Legacy data bridge
export {
  parseCsvRecords,
  parseXmlRecords,
  normalizeRecord,
  normalizeLegacyData,
} from './legacy/normalize';
export type { FieldMapping, NormalizeOptions } from './legacy/normalize';

// Connectors
export {
  bachs,
  bachsEnvironment,
  bachsEnvironmentForKey,
  createBachsClient,
  isBachsConfigured,
  isBachsKey,
  verifyBachsKey,
  formatMoney,
  maskTail,
} from './connectors/bachs';
export type {
  BachsPayment,
  BachsPaymentListItem,
  BachsList,
  BachsCustomer,
  BachsRefund,
  BachsDispute,
  BachsStatusChange,
} from './connectors/bachs';
export {
  github,
  createGithubClient,
  connectedRepo,
  resolveRepo,
  normalizeRepo,
  isGithubConfigured,
  verifyGithubAccess,
} from './connectors/github';
export { postSlackMessage, postSlackMessageTo, isSlackWebhookUrl, sendNotificationTool } from './connectors/slack';
