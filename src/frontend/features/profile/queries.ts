/**
 * @file 【前端·数据】职业档案
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/frontend/lib/api';
import { RESUME_PARSE_CONSENT } from '@/shared/schemas/consent';
import type { ProfileBody } from '@/shared/schemas/profile';

export const profileKeys = {
  consent: ['profile', 'consent'] as const,
  profile: ['profile', 'current'] as const,
};

export function useResumeConsent() {
  return useQuery({
    queryKey: profileKeys.consent,
    queryFn: () => unwrap(api.consents['resume-parse'].$get()),
  });
}

export function useProfile() {
  return useQuery({
    queryKey: profileKeys.profile,
    queryFn: () => unwrap(api.profile.$get()),
  });
}

export function useGrantConsent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      unwrap(
        api.consents.$post({
          json: { purpose: RESUME_PARSE_CONSENT.purpose, version: RESUME_PARSE_CONSENT.version },
        }),
      ),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: profileKeys.consent });
    },
  });
}

export function useExtractProfile() {
  return useMutation({
    mutationFn: (text: string) => unwrap(api.profile.extract.$post({ json: { text } })),
  });
}

export function useSaveProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: ProfileBody) => unwrap(api.profile.$put({ json: body })),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: profileKeys.profile });
    },
  });
}
