import {
  Avatar,
  Button,
  HStack,
  Stack,
  Text,
  useToast,
} from '@chakra-ui/react';
import { useEffect } from 'react';

import { useAuth } from '../providers/useAuth';

export function AuthControls() {
  const {
    isAuthenticated,
    user,
    startLogin,
    logout,
    isAuthenticating,
    authError,
  } = useAuth();
  const toast = useToast();

  useEffect(() => {
    if (!authError) return;
    toast({
      title: '登录失败',
      description: authError,
      status: 'error',
      duration: 4000,
      isClosable: true,
    });
  }, [authError, toast]);

  if (!isAuthenticated) {
    return (
      <Stack spacing={1} align='flex-start'>
        <Button
          colorScheme='orange'
          size='sm'
          onClick={startLogin}
          isDisabled={isAuthenticating}
          isLoading={isAuthenticating}
        >
          登录云朵角落
        </Button>
        {/* keep spacing consistent even without status text */}
        <Text fontSize='xs' color='gray.600' visibility='hidden'>
          占位
        </Text>
        {authError && (
          <Text fontSize='xs' color='red.500'>
            {authError}
          </Text>
        )}
      </Stack>
    );
  }

  const displayName = user?.username ?? user?.email ?? user?.userId;

  return (
    <Stack spacing={1} align='flex-end'>
      <HStack spacing={3}>
        <Avatar size='sm' name={displayName} bg='orange.400' color='white' />
        <Text fontSize='sm' maxW='240px' noOfLines={1}>
          {displayName}
        </Text>
        <Button colorScheme='gray' size='sm' variant='outline' onClick={logout}>
          退出
        </Button>
      </HStack>
      <Text fontSize='xs' color='gray.600' visibility='hidden'>
        占位
      </Text>
      {authError && (
        <Text fontSize='xs' color='red.500'>
          {authError}
        </Text>
      )}
    </Stack>
  );
}
