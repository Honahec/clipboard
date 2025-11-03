import {
  Box,
  Button,
  Card,
  CardBody,
  FormControl,
  FormHelperText,
  FormLabel,
  Select,
  Stack,
  Switch,
  Textarea,
  useToast,
} from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';

import { createClipboard } from '../api/clipboard';
import { useAuth } from '../providers/useAuth';

type ExpiryOption = 'none' | '1h' | '24h' | '7d';
function expiryToDate(option: ExpiryOption): string | null {
  if (option === 'none') return null;
  const now = Date.now();

  const mapping: Record<Exclude<ExpiryOption, 'none'>, number> = {
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
  };
  const increment = mapping[option as Exclude<ExpiryOption, 'none'>];
  return new Date(now + increment).toISOString();
}

export function ClipboardForm() {
  const { token, user, isAuthenticated } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [content, setContent] = useState('');
  const [expiryOption, setExpiryOption] = useState<ExpiryOption>('none');
  const [isPrivate, setIsPrivate] = useState(false);

  const createMutation = useMutation({
    mutationFn: (payload: {
      content: string;
      expires_at: string | null;
      user?: string | null;
      is_public?: boolean;
    }) => createClipboard(payload, { token }),
    onSuccess: (response) => {
      toast({
        title: '剪贴板已保存',
        description: `分享代码：${response.clipboard_id}`,
        status: 'success',
        duration: 4000,
        isClosable: true,
      });
      setContent('');
      setExpiryOption('none');
      setIsPrivate(false);
      queryClient.invalidateQueries({ queryKey: ['clipboards'] });
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : '未知错误，请稍后再试';
      toast({
        title: '保存失败',
        description: message,
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    },
  });

  const isSubmitDisabled = useMemo(() => {
    if (!content.trim()) return true;
    if (isPrivate && !isAuthenticated) return true;
    return createMutation.isPending;
  }, [content, createMutation.isPending, isAuthenticated, isPrivate]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!content.trim()) return;

    const expires_at = expiryToDate(expiryOption);
    createMutation.mutate({
      content: content.trim(),
      expires_at,
      user: isPrivate ? user?.userId ?? null : null,
      is_public: !isPrivate,
    });
  };

  return (
    <Box as='form' onSubmit={handleSubmit}>
      <Card variant='outline'>
        <CardBody>
          <Stack spacing={5}>
            <FormControl isRequired>
              <FormLabel htmlFor='clipboard-content'>内容</FormLabel>
              <Textarea
                id='clipboard-content'
                placeholder='在这里输入或粘贴要共享的文本...'
                minH='160px'
                value={content}
                onChange={(event) => setContent(event.target.value)}
                resize='vertical'
              />
            </FormControl>

            <FormControl>
              <FormLabel htmlFor='clipboard-expiry'>过期时间</FormLabel>
              <Select
                id='clipboard-expiry'
                value={expiryOption}
                onChange={(event) =>
                  setExpiryOption(event.target.value as ExpiryOption)
                }
              >
                {isAuthenticated && <option value='none'>永不过期</option>}
                <option value='1h'>1 小时后</option>
                <option value='24h'>24 小时后</option>
                <option value='7d'>7 天后</option>
              </Select>
            </FormControl>

            <FormControl
              display='flex'
              alignItems='center'
              justifyContent='space-between'
              isDisabled={!isAuthenticated}
            >
              <FormLabel htmlFor='private-switch' mb='0'>
                仅自己可见
              </FormLabel>
              <Switch
                id='private-switch'
                colorScheme='orange'
                isChecked={isPrivate && isAuthenticated}
                onChange={() => setIsPrivate((prev) => !prev)}
              />
              {!isAuthenticated && (
                <FormHelperText>
                  登录云朵角落账号后可开启「仅自己可见」选项。
                </FormHelperText>
              )}
            </FormControl>

            <Button
              type='submit'
              colorScheme='orange'
              isDisabled={isSubmitDisabled}
              isLoading={createMutation.isPending}
              alignSelf='flex-start'
            >
              保存
            </Button>
          </Stack>
        </CardBody>
      </Card>
    </Box>
  );
}
