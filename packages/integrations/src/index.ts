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
  isBachsConfigured,
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
export { github, resolveRepo, isGithubConfigured } from './connectors/github';
export { postSlackMessage, sendNotificationTool } from './connectors/slack';
