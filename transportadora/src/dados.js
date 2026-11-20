// Dados da própria transportadora (fictícia): armazém, clientes, prazos e tempos de serviço.
// Nada disto vem da API da cidade. Coordenadas em WGS84 (lon, lat).

// Índice 0 = armazém; 1 a 10 = pontos de entrega.
export const PONTOS = [
  { nome: 'Armazém Ria Express', lon: -8.637544, lat: 40.644947 },
  { nome: 'Farmácia Rossio', lon: -8.656268, lat: 40.640765 },
  { nome: 'Mercado Manuel Firmino', lon: -8.651460, lat: 40.639076 },
  { nome: 'Loja Fórum Aveiro', lon: -8.653057, lat: 40.641638 },
  { nome: 'Clínica Av. Artur Ravara', lon: -8.653333, lat: 40.636928 },
  { nome: 'Universidade · Campus de Santiago', lon: -8.656356, lat: 40.631238 },
  { nome: 'Café Cais da Fonte Nova', lon: -8.643408, lat: 40.639541 },
  { nome: 'Livraria Av. 25 de Abril', lon: -8.647287, lat: 40.636493 },
  { nome: 'Hotel junto à Estação', lon: -8.640286, lat: 40.642639 },
  { nome: 'Restaurante Beira-Mar', lon: -8.656107, lat: 40.643939 },
  { nome: 'Escritório Glicínias', lon: -8.640175, lat: 40.630597 },
];

// Prazo de entrega, em minutos depois da partida, para os clientes que o têm.
export const PRAZOS = { 2: 30, 4: 38, 1: 46, 5: 58, 10: 72 };

// Minutos parados em cada entrega: com chuva demora-se mais a descarregar.
export const SERVICO = { normal: 6, chuva: 7 };
