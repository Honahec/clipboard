import {
  Box,
  Container,
  Flex,
  Heading,
  Stack,
  Text,
  useColorModeValue,
} from '@chakra-ui/react';

import { AuthControls } from './components/AuthControls';
import { ClipboardForm } from './components/ClipboardForm';
import { ClipboardList } from './components/ClipboardList';
import { useAuth } from './providers/useAuth';

function App() {
  const { isAuthenticated } = useAuth();
  const heroBg = useColorModeValue('white', 'gray.800');
  const heroBorder = useColorModeValue('gray.200', 'gray.700');

  return (
    <Box minH='100vh' bgGradient='linear(to-br, orange.50, gray.100)'>
      <Container maxW='6xl' py={{ base: 8, md: 12 }}>
        <Stack spacing={10}>
          <Flex
            direction={{ base: 'column', md: 'row' }}
            align={{ base: 'flex-start', md: 'center' }}
            justify='space-between'
            bg={heroBg}
            border='1px solid'
            borderColor={heroBorder}
            borderRadius='2xl'
            p={{ base: 6, md: 8 }}
            boxShadow='lg'
            gap={6}
          >
            <Stack spacing={3}>
              <Heading
                size={{ base: 'lg', md: 'xl' }}
                bgGradient='linear(to-r, orange.400, pink.500)'
                bgClip='text'
              >
                云朵角落 Clipboard
              </Heading>
              <Text fontSize='md' color='gray.600'>
                创建可分享的剪贴板，支持匿名访问。登录云朵角落账号后可开启「仅自己可见」，
                保护你的私密内容。
              </Text>
              {!isAuthenticated && (
                <Text fontSize='sm' color='gray.500'>
                  未登录状态下创建的剪贴板为公开，可供任何访客浏览。
                </Text>
              )}
            </Stack>
            <AuthControls />
          </Flex>

          <ClipboardForm />

          <Stack spacing={4}>
            <Heading size='md'>剪贴板列表</Heading>
            <ClipboardList />
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}

export default App;
