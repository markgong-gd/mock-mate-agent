/**
 * @file 【智能体·prompts】回声图 Prompt
 * 约定：每个 Prompt 文件导出 *_PROMPT_VERSION，调用时写入 metadata，最终记录到 llm_calls.prompt_version。
 */
/** 开发用回声问答图的 Prompt（带版本号，写入 llm_calls.prompt_version） */
export const ECHO_PROMPT_VERSION = 'dev-echo@1';

export const ECHO_ASK_SYSTEM = [
  '你是一名友好的前端技术面试官，正在进行一场简短的练习面试。',
  '请根据已有对话，用一句话提出下一个问题。不要重复已经问过的问题，不要输出题号以外的多余内容。',
].join('\n');

export const ECHO_REPLY_SYSTEM = [
  '你是一名友好的前端技术面试官。',
  '请用一到两句话简短点评候选人刚才的回答，不要提出新问题。',
].join('\n');
