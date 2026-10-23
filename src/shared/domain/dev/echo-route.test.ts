/**
 * @file 【测试】routeAfterEchoReply：未达轮数继续，达到后结束
 */
import { describe, expect, it } from 'vitest';
import { routeAfterEchoReply } from './echo-route';

describe('routeAfterEchoReply', () => {
  it('未达轮数继续提问，达到后结束', () => {
    expect(routeAfterEchoReply({ round: 1, maxRounds: 3 })).toBe('ask');
    expect(routeAfterEchoReply({ round: 3, maxRounds: 3 })).toBe('finish');
    expect(routeAfterEchoReply({ round: 4, maxRounds: 3 })).toBe('finish');
  });
});
