/**
 * @file 【测试】策划稿防编造：公司、数字、已接受字段、联系方式
 */
import { describe, expect, it } from 'vitest';
import { emptyStudioDocument, type StudioDocument } from '@/shared/schemas/studio';
import { fillStudioContact, guardStudioDocument } from './guard';

function doc(patch: Partial<StudioDocument> = {}): StudioDocument {
  return { ...emptyStudioDocument(), ...patch, basics: { ...emptyStudioDocument().basics, ...patch.basics } };
}

describe('guardStudioDocument', () => {
  it('用户没说过的公司和数字不会写进去', () => {
    const result = guardStudioDocument(
      emptyStudioDocument(),
      doc({
        experiences: [{ org: '阿里巴巴', title: '架构师', start: '', end: '', bullets: ['QPS 提升 10 倍'] }],
      }),
      '我在字节跳动做前端，首屏从 4 秒降到 1.8 秒',
    );
    expect(result.dropped).toBeGreaterThan(0);
    expect(result.document.experiences).toEqual([]);
  });

  it('原话里的公司和数字可以留下', () => {
    const corpus = '我在字节跳动做前端，首屏从 4 秒降到 1.8 秒';
    const result = guardStudioDocument(
      emptyStudioDocument(),
      doc({
        basics: { name: '', headline: '前端', phone: '', email: '', location: '' },
        skills: ['前端'],
        experiences: [
          {
            org: '字节跳动',
            title: '前端',
            start: '',
            end: '',
            bullets: ['首屏从 4 秒降到 1.8 秒'],
          },
        ],
      }),
      corpus,
    );
    expect(result.dropped).toBe(0);
    expect(result.document.experiences[0]?.org).toBe('字节跳动');
    expect(result.document.experiences[0]?.bullets[0]).toContain('1.8');
    expect(result.document.skills).toEqual(['前端']);
  });

  it('已经接受的公司，即使用户这轮没再提，也还在', () => {
    const previous = doc({
      experiences: [
        { org: '字节跳动', title: '前端', start: '', end: '', bullets: ['首屏从 4 秒降到 1.8 秒'] },
      ],
    });
    const result = guardStudioDocument(
      previous,
      doc({
        experiences: [
          {
            org: '字节跳动',
            title: '前端',
            start: '',
            end: '',
            bullets: ['首屏从 4 秒降到 1.8 秒', 'QPS 提升 10 倍'],
          },
        ],
      }),
      '再补充一句',
    );
    expect(result.document.experiences[0]?.org).toBe('字节跳动');
    expect(result.document.experiences[0]?.bullets).toEqual(['首屏从 4 秒降到 1.8 秒']);
  });
});

describe('fillStudioContact', () => {
  it('从原话补电话和邮箱，不覆盖已经写上的', () => {
    const filled = fillStudioContact(
      doc({ basics: { name: '', headline: '', phone: '13800000000', email: '', location: '' } }),
      '电话 13912345678，邮箱 ada@example.com',
    );
    expect(filled.basics.phone).toBe('13800000000');
    expect(filled.basics.email).toBe('ada@example.com');
  });
});
