// Modelos padrão. Sintaxe:
//   # Título (centralizado)   ## Subtítulo   **negrito**   linha em branco = novo parágrafo
//   {{variavel}} = dado do sistema   {{assinaturas}} = bloco de assinaturas
const CONTRATO_VENDA = `# CONTRATO DE COMPRA E VENDA DE VEÍCULO

Pelo presente instrumento particular, de um lado **{{empresa.razao_social}}**, inscrita no CNPJ sob o nº {{empresa.cnpj}}, com sede em {{empresa.endereco_completo}}, doravante denominada **VENDEDORA**, e de outro lado **{{cliente.nome}}**, {{cliente.qualificacao}}, inscrito(a) no CPF/CNPJ sob o nº {{cliente.cpf_cnpj}}, residente e domiciliado(a) em {{cliente.endereco_completo}}, telefone {{cliente.telefone}}, doravante denominado(a) **COMPRADOR(A)**, têm entre si justo e contratado o seguinte:

## CLÁUSULA 1ª – DO OBJETO

A VENDEDORA vende ao(à) COMPRADOR(A) o veículo de sua propriedade com as seguintes características: **{{veiculo.descricao}}**, ano de fabricação/modelo {{veiculo.ano_fab}}/{{veiculo.ano_mod}}, cor {{veiculo.cor}}, placa {{veiculo.placa}}, RENAVAM {{veiculo.renavam}}, chassi {{veiculo.chassi}}, com {{veiculo.km}} km rodados no ato da entrega.

## CLÁUSULA 2ª – DO PREÇO E DA FORMA DE PAGAMENTO

O preço certo e ajustado para a presente venda é de **{{venda.valor}} ({{venda.valor_extenso}})**, a ser pago da seguinte forma:

{{venda.pagamentos}}

## CLÁUSULA 3ª – DA ENTREGA E DA TRANSFERÊNCIA

O veículo é entregue nesta data, no estado em que se encontra, tendo o(a) COMPRADOR(A) o examinado e o aceito. A partir da entrega, o(a) COMPRADOR(A) assume total responsabilidade civil e criminal pelo uso do veículo, bem como por multas, tributos e encargos posteriores a esta data. O(A) COMPRADOR(A) se obriga a efetuar a transferência de propriedade junto ao DETRAN no prazo legal de 30 (trinta) dias.

## CLÁUSULA 4ª – DA GARANTIA

A VENDEDORA concede garantia de {{venda.garantia_dias}} dias, contados da entrega, limitada a motor e câmbio, nos termos do Código de Defesa do Consumidor. A garantia não cobre itens de desgaste natural, mau uso, acidentes ou serviços realizados fora da rede indicada pela VENDEDORA.

## CLÁUSULA 5ª – DAS DECLARAÇÕES

A VENDEDORA declara que o veículo encontra-se livre e desembaraçado de quaisquer ônus, multas, alienações ou restrições judiciais e administrativas até a presente data.

## CLÁUSULA 6ª – DO FORO

Fica eleito o foro da comarca de {{empresa.foro}} para dirimir quaisquer dúvidas oriundas deste contrato.

E, por estarem assim justos e contratados, as partes assinam o presente instrumento.

{{empresa.cidade}}, {{data_extenso}}.

{{assinaturas}}`;

const RECIBO_PAGAMENTO = `# RECIBO DE PAGAMENTO

**Valor: {{venda.valor}}**

Recebemos de **{{cliente.nome}}**, CPF/CNPJ {{cliente.cpf_cnpj}}, a importância de **{{venda.valor}} ({{venda.valor_extenso}})**, referente à compra do veículo **{{veiculo.descricao}}**, ano {{veiculo.ano_fab}}/{{veiculo.ano_mod}}, placa {{veiculo.placa}}, chassi {{veiculo.chassi}}, conforme detalhamento abaixo:

{{venda.pagamentos}}

Para clareza, firmamos o presente recibo dando plena e geral quitação dos valores efetivamente recebidos.

{{empresa.cidade}}, {{data_extenso}}.

{{assinatura_empresa}}`;

const RECIBO_COMPRA = `# RECIBO DE COMPRA DE VEÍCULO

**Valor: {{compra.valor}}**

Eu, **{{fornecedor.nome}}**, CPF/CNPJ {{fornecedor.cpf_cnpj}}, RG {{fornecedor.rg}}, residente em {{fornecedor.endereco_completo}}, declaro que recebi de **{{empresa.razao_social}}**, CNPJ {{empresa.cnpj}}, a importância de **{{compra.valor}} ({{compra.valor_extenso}})**, referente à venda do veículo **{{veiculo.descricao}}**, ano {{veiculo.ano_fab}}/{{veiculo.ano_mod}}, cor {{veiculo.cor}}, placa {{veiculo.placa}}, RENAVAM {{veiculo.renavam}}, chassi {{veiculo.chassi}}, com {{veiculo.km}} km.

Declaro ainda que o veículo está livre de ônus, multas, alienações e restrições até esta data, responsabilizando-me por quaisquer débitos anteriores à data de entrega, e que entrego o documento de transferência (ATPV-e) devidamente preenchido.

{{empresa.cidade}}, {{data_extenso}}.

{{assinatura_fornecedor}}`;

const TERMO_GARANTIA = `# TERMO DE GARANTIA

A **{{empresa.razao_social}}** concede ao(à) cliente **{{cliente.nome}}**, CPF/CNPJ {{cliente.cpf_cnpj}}, garantia de **{{venda.garantia_dias}} dias** a contar de {{venda.data}}, para o veículo **{{veiculo.descricao}}**, placa {{veiculo.placa}}, chassi {{veiculo.chassi}}.

## COBERTURA

A garantia cobre defeitos de funcionamento em motor (partes internas lubrificadas) e câmbio (partes internas), mediante avaliação técnica da VENDEDORA.

## EXCLUSÕES

Não estão cobertos: itens de desgaste natural (pneus, freios, embreagem, bateria, lâmpadas, palhetas), danos por mau uso, acidentes, enchentes, alterações de características originais e serviços realizados fora da rede indicada.

## CONDIÇÕES

O(A) cliente deve realizar as revisões recomendadas e comunicar qualquer defeito imediatamente. A quilometragem na entrega é de {{veiculo.km}} km.

{{empresa.cidade}}, {{data_extenso}}.

{{assinaturas}}`;

const TERMO_ENTREGA = `# TERMO DE ENTREGA DE VEÍCULO

Declaro que recebi da **{{empresa.razao_social}}**, nesta data, o veículo **{{veiculo.descricao}}**, ano {{veiculo.ano_fab}}/{{veiculo.ano_mod}}, cor {{veiculo.cor}}, placa {{veiculo.placa}}, chassi {{veiculo.chassi}}, com {{veiculo.km}} km, em perfeito estado de conservação e funcionamento, acompanhado de manual, chave reserva (quando houver) e documentação.

A partir desta data assumo inteira responsabilidade civil e criminal pelo veículo.

{{empresa.cidade}}, {{data_extenso}}.

{{assinaturas}}`;

const DEFAULT_TEMPLATES = [
  { nome: 'Contrato de compra e venda', tipo: 'contrato_venda', conteudo: CONTRATO_VENDA },
  { nome: 'Recibo de pagamento (venda)', tipo: 'recibo_pagamento', conteudo: RECIBO_PAGAMENTO },
  { nome: 'Recibo de compra de veículo', tipo: 'recibo_compra', conteudo: RECIBO_COMPRA },
  { nome: 'Termo de garantia', tipo: 'termo_garantia', conteudo: TERMO_GARANTIA },
  { nome: 'Termo de entrega', tipo: 'termo_entrega', conteudo: TERMO_ENTREGA },
];

module.exports = { DEFAULT_TEMPLATES };
