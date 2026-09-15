import type { MessageKey } from '../lib/i18n.svelte.ts';

const pt: Record<MessageKey, string> = {
  'common.loading': 'Carregando…',

  'error.network': 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.',
  'error.unexpected': 'Algo deu errado. Tente novamente.',
  'error.loadFailed': 'Não foi possível carregar esta página. Tente recarregá-la.',

  'home.tagline': 'Quizzes e enquetes para a sala de aula.',
  'home.presenterArea': 'Área do apresentador',

  'login.title': 'Acesso do apresentador',
  'login.password': 'Senha',
  'login.submit': 'Entrar',
  'login.wrongPassword': 'Senha incorreta.',
  'login.tooManyAttempts': 'Muitas tentativas. Aguarde um minuto e tente novamente.',

  'admin.logout': 'Sair',
  'admin.quizzes': 'Quizzes',
  'admin.noQuizzes': 'Nenhum quiz ainda.',

  'notFound.title': 'Página não encontrada',
  'notFound.back': 'Ir para a página inicial',
};

export default pt;
