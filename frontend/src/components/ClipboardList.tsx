import {
  Badge,
  Box,
  Button,
  Card,
  CardBody,
  CardHeader,
  Flex,
  Heading,
  IconButton,
  SimpleGrid,
  Spinner,
  Stack,
  Text,
  Tooltip,
  useToast,
} from '@chakra-ui/react';
import { DeleteIcon, RepeatIcon } from '@chakra-ui/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import {
  deleteClipboard,
  fetchClipboards,
  updateClipboard,
} from '../api/clipboard';
import { useAuth } from '../providers/useAuth';
import type { ClipboardRecord } from '../types';

function formatDate(value?: string | null): string {
  if (!value) return '永久';
  return new Date(value).toLocaleString();
}

function ClipboardCard({
  clipboard,
  onDelete,
  onToggleVisibility,
  canManage,
  isDeleting,
  isToggling,
}: {
  clipboard: ClipboardRecord;
  onDelete: (clipboardId: string) => void;
  onToggleVisibility: (clipboard: ClipboardRecord) => void;
  canManage: boolean;
  isDeleting: boolean;
  isToggling: boolean;
}) {
  const isPrivate = !clipboard.is_public;
  return (
    <Card variant='outline'>
      <CardHeader pb={0}>
        <Flex align='center' justify='space-between'>
          <Heading size='sm'>{clipboard.clipboard_id}</Heading>
          <Stack direction='row' spacing={2} align='center'>
            <Badge colorScheme={isPrivate ? 'red' : 'green'}>
              {isPrivate ? '仅自己可见' : '公开'}
            </Badge>
            {clipboard.expires_at && (
              <Badge colorScheme='orange'>即将过期</Badge>
            )}
          </Stack>
        </Flex>
      </CardHeader>
      <CardBody pt={2}>
        <Stack spacing={4}>
          <Box
            bg='gray.50'
            borderRadius='md'
            p={3}
            borderWidth='1px'
            borderColor='gray.200'
            whiteSpace='pre-wrap'
          >
            {clipboard.content}
          </Box>
          <Stack spacing={1} fontSize='sm' color='gray.600'>
            <Text>创建时间：{formatDate(clipboard.created_at)}</Text>
            {clipboard.updated_at && (
              <Text>更新：{formatDate(clipboard.updated_at)}</Text>
            )}
            <Text>
              过期：
              {(formatDate(clipboard.expires_at) === '永久' && '永不过期') ||
                formatDate(clipboard.expires_at)}
            </Text>
          </Stack>
          {canManage && (
            <Flex justify='flex-end' gap={2}>
              <Button
                size='sm'
                variant='outline'
                onClick={() => onToggleVisibility(clipboard)}
                isLoading={isToggling}
                isDisabled={isDeleting || isToggling}
              >
                {clipboard.is_public ? '设为仅本人可见' : '设为公开'}
              </Button>
              <IconButton
                size='sm'
                colorScheme='red'
                aria-label='删除剪贴板'
                icon={<DeleteIcon />}
                onClick={() => onDelete(clipboard.clipboard_id)}
                isLoading={isDeleting}
                isDisabled={isDeleting || isToggling}
              />
            </Flex>
          )}
        </Stack>
      </CardBody>
    </Card>
  );
}

export function ClipboardList() {
  const { token, user, isAuthenticated } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => ['clipboards', isAuthenticated ? 'private' : 'public'],
    [isAuthenticated]
  );

  const query = useQuery({
    queryKey,
    queryFn: () => fetchClipboards({ token }),
  });

  const deleteMutation = useMutation({
    mutationFn: (clipboardId: string) =>
      deleteClipboard(clipboardId, { token }),
    onSuccess: () => {
      toast({
        title: '已删除',
        status: 'success',
        duration: 2000,
        isClosable: true,
      });
      queryClient.invalidateQueries({ queryKey: ['clipboards'] });
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : '删除失败，请稍后再试';
      toast({
        title: '删除失败',
        description: message,
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (clipboard: ClipboardRecord) =>
      updateClipboard(
        clipboard.clipboard_id,
        { is_public: !clipboard.is_public },
        { token }
      ),
    onSuccess: () => {
      toast({
        title: '可见性已更新',
        status: 'success',
        duration: 2000,
        isClosable: true,
      });
      queryClient.invalidateQueries({ queryKey: ['clipboards'] });
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : '操作失败，请稍后再试';
      toast({
        title: '无法更新可见性',
        description: message,
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    },
  });

  const handleDelete = (clipboardId: string) => {
    deleteMutation.mutate(clipboardId);
  };

  const handleToggle = (clipboard: ClipboardRecord) => {
    toggleMutation.mutate(clipboard);
  };

  if (query.isLoading) {
    return (
      <Flex align='center' justify='center' minH='120px'>
        <Spinner size='lg' color='orange.400' />
      </Flex>
    );
  }

  if (query.isError) {
    const message =
      query.error instanceof Error
        ? query.error.message
        : '加载列表失败，请稍后再试';
    return (
      <Stack align='center' spacing={4} py={10} color='gray.600'>
        <Heading size='sm'>加载失败</Heading>
        <Text>{message}</Text>
        <Button
          onClick={() =>
            queryClient.invalidateQueries({ queryKey: ['clipboards'] })
          }
          leftIcon={<RepeatIcon />}
        >
          重试
        </Button>
      </Stack>
    );
  }

  const clipboards = query.data ?? [];

  if (clipboards.length === 0) {
    return (
      <Stack align='center' spacing={3} py={10} color='gray.500'>
        <Heading size='sm'>暂无剪贴板</Heading>
        <Text>创建一个新的剪贴板或等待他人分享。</Text>
        {!isAuthenticated && (
          <Tooltip label='登录后可以创建仅自己可见的剪贴板'>
            <Text fontSize='xs' color='gray.400'>
              提示：未登录用户也可浏览公共剪贴板。
            </Text>
          </Tooltip>
        )}
      </Stack>
    );
  }

  return (
    <SimpleGrid spacing={3}>
      {clipboards.map((clipboard) => {
        const canManage =
          Boolean(user?.userId) && clipboard.user === user?.userId;
        const isDeleting =
          deleteMutation.isPending &&
          deleteMutation.variables === clipboard.clipboard_id;
        const isToggling =
          toggleMutation.isPending &&
          toggleMutation.variables?.clipboard_id === clipboard.clipboard_id;
        return (
          <ClipboardCard
            key={clipboard.clipboard_id}
            clipboard={clipboard}
            onDelete={handleDelete}
            onToggleVisibility={handleToggle}
            canManage={canManage}
            isDeleting={isDeleting}
            isToggling={isToggling}
          />
        );
      })}
    </SimpleGrid>
  );
}
