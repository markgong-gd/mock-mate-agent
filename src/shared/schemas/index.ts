/**
 * @file 【公共·schemas】领域 Zod 定义的出口
 * 规则：LLM 结构化输出和 API 入参都从这里引用，不要在路由或 Prompt 旁再手写一套同构类型。
 */
export * from './consent';
export * from './embedding';
export * from './interview';
export * from './job';
export * from './profile';
export * from './question';
export * from './resume';
export * from './skill-tags';
