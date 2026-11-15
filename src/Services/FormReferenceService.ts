import { HTMLElement, parse } from "node-html-parser";
import type { ExtractedDocument, ExtractedSegment, FormItem } from "@/Protocols/DocumentTextProtocol.ts";
import type { FreSectionTag } from "@/Protocols/FreProtocol.ts";
import { PdfTextService } from "@/Services/PdfTextService.ts";
import { TextUtil } from "@/Utils/TextUtil.ts";
import { ZipFileUtil } from "@/Utils/ZipFileUtil.ts";

const XML_SUFFIX = ".xml";
const FORM_PATH = ["XmlFormularioReferencia", "DadosFRE", "Formulario"] as const;
const NAME_TAG = "NomeArquivoPdf";
const CONTENT_TAG = "ImagemObjetoArquivoPdf";
const WINDOWS_1252 = "windows-1252";
const PDF_SUFFIX = /\.pdf$/iu;
const DOCX_SUFFIX = /(?: docx|\.docx)+$/iu;
const UNNAMED_ITEM = "documento";
const FRE_ROOT = "<XmlFormularioReferencia";
// Why: the item number is CVM's, not the company's: it is read from the element that holds each item PDF inside its section tag, through this table (issue #61, S11). The source of each row is the labels of the five forms measured on 2026-11-15 (ITUB4 and WEGE3 for 8.18 and 8.19); the rows of 13.1 and 13.2 are inferred from the element names and are to be checked against CVM's layout (ADR 0043).
const FRE_ITEM_ROWS: readonly (readonly [FreSectionTag, string, string])[] = [
  ["AtividadesEmissor", "HistoricoEmissor", "1.1"],
  ["AtividadesEmissor", "AtividadesEmissorControladas", "1.2"],
  ["AtividadesEmissor", "InfoSegmentosOperacionais", "1.3"],
  ["AtividadesEmissor", "ProducaoComercializacaoMercados", "1.4"],
  ["AtividadesEmissor", "PrincipaisClientes", "1.5"],
  ["AtividadesEmissor", "EfeitosRegulacaoEstatal", "1.6"],
  ["AtividadesEmissor", "ReceitasRelevantes", "1.7"],
  ["AtividadesEmissor", "EfeitosRegulacaoEstrangeira", "1.8"],
  ["AtividadesEmissor", "InfoASG", "1.9"],
  ["AtividadesEmissor", "InfoSociedadeEconomiaMista", "1.10"],
  ["AtividadesEmissor", "AtivoRelevante", "1.11"],
  ["AtividadesEmissor", "OperacoesSocietarias", "1.12"],
  ["AtividadesEmissor", "AcordosAcionistas", "1.13"],
  ["AtividadesEmissor", "AlteracoesNegocios", "1.14"],
  ["AtividadesEmissor", "ContratosRelevantes", "1.15"],
  ["AtividadesEmissor", "OutrasInfoRelevantes", "1.16"],
  ["ComentariosDiretores", "CondicoesFinanceirasPatrimoniais", "2.1"],
  ["ComentariosDiretores", "ResultadosOperFinanceiros", "2.2"],
  ["ComentariosDiretores", "MudancasPraticasContabeis", "2.3"],
  ["ComentariosDiretores", "EfeitosRelevantesDF", "2.4"],
  ["ComentariosDiretores", "MedicoesNaoContabeis", "2.5"],
  ["ComentariosDiretores", "EventosSubsequentesDF", "2.6"],
  ["ComentariosDiretores", "DestinacaoResultados", "2.7"],
  ["ComentariosDiretores", "ItensRelevantesNaoEvidenciadosDF", "2.8"],
  ["ComentariosDiretores", "ComentariosItensNaoEvidenciados", "2.9"],
  ["ComentariosDiretores", "PlanoNegocios", "2.10"],
  ["ComentariosDiretores", "FatoresInfluenciaDesempenhoOperacional", "2.11"],
  ["Projecoes", "ProjecoesDivulgadasPremissas", "3.1"],
  ["Projecoes", "AcompanhamentoProjecoes", "3.2"],
  ["Projecoes", "DescricaoFatoresRisco", "4.1"],
  ["Projecoes", "Descricao5PrincipaisFatoresRisco", "4.2"],
  ["Projecoes", "DescricaoRiscosMercado", "4.3"],
  ["Projecoes", "ProcessosNaoSigilosos", "4.4"],
  ["Projecoes", "ValorProvisionadoProcessosNaoSigilosos", "4.5"],
  ["Projecoes", "ProcessosSigilosos", "4.6"],
  ["Projecoes", "ContingenciasRelevantes", "4.7"],
  ["PoliticaGerenciamentoRiscosEControleInterno", "DescricaoGerenciamentoRiscos", "5.1"],
  ["PoliticaGerenciamentoRiscosEControleInterno", "DescricaoControlesInternos", "5.2"],
  ["PoliticaGerenciamentoRiscosEControleInterno", "ProgramaIntegridade", "5.3"],
  ["PoliticaGerenciamentoRiscosEControleInterno", "AlteracoesSignificativas", "5.4"],
  ["PoliticaGerenciamentoRiscosEControleInterno", "OutrasInfRelev", "5.5"],
  ["ControleGrupoEconomico", "OrganogramaAcionistasGrupoEconomico", "6.5"],
  ["ControleGrupoEconomico", "OutrasInfRelev", "6.6"],
  ["ControleGrupoEconomico", "CaracteristicasOrgaosAdmECF", "7.1"],
  ["ControleGrupoEconomico", "InformacoesConselhoAdm", "7.2"],
  ["ControleGrupoEconomico", "AcordosSegurosAdministradores", "7.7"],
  ["ControleGrupoEconomico", "OutrasInfRelev", "7.8"],
  ["RemuneracaoAdministradores", "PoliticaPraticaRemuneracao", "8.1"],
  ["RemuneracaoAdministradores", "PlanoRemuneracaoBaseadoAcoes", "8.4"],
  ["RemuneracaoAdministradores", "OutorgaOpcoesCompraAcao", "8.6"],
  ["RemuneracaoAdministradores", "OpcoesAberto", "8.7"],
  ["RemuneracaoAdministradores", "OpcoesExercidasAcoesEntregues", "8.8"],
  ["RemuneracaoAdministradores", "RemunBaseadaAcoesASeremEntregues", "8.9"],
  ["RemuneracaoAdministradores", "OutorgaAcoes", "8.10"],
  ["RemuneracaoAdministradores", "PrecificacaoAcoesOpcoes", "8.12"],
  ["RemuneracaoAdministradores", "ParticipacaoDetidaOrgao", "8.13"],
  ["RemuneracaoAdministradores", "PlanosPrevidencia", "8.14"],
  ["RemuneracaoAdministradores", "MecanismosRemuneracaoIndenizacao", "8.16"],
  ["RemuneracaoAdministradores", "PercentualPartesRelacionadas", "8.17"],
  ["RemuneracaoAdministradores", "RemuneracaoOutrasFuncoes", "8.18"],
  ["RemuneracaoAdministradores", "RemuneracaoReconhecidaControlador", "8.19"],
  ["RemuneracaoAdministradores", "OutrasInfRelev", "8.20"],
  ["Auditores", "IndependConflitoInteresse", "9.3"],
  ["Auditores", "OutrasInfRelev", "9.4"],
  ["Auditores", "DescricaoRH", "10.1"],
  ["Auditores", "AlteracoesRelev", "10.2"],
  ["Auditores", "RemuneracaoEmpregados", "10.3"],
  ["Auditores", "RelacaoEmissorSindicato", "10.4"],
  ["Auditores", "OutrasInfRelev", "10.5"],
  ["TransacoesPartesRelacionadas", "RegrasPoliticasPraticas", "11.1"],
  ["TransacoesPartesRelacionadas", "OutrasInfRelevNO", "11.2"],
  ["TransacoesPartesRelacionadas", "OutrasInfRelev", "11.3"],
  ["TransacoesPartesRelacionadas", "EmissoresEstrangeiros", "12.2"],
  ["TransacoesPartesRelacionadas", "MercadosNegociacaoBR", "12.5"],
  ["TransacoesPartesRelacionadas", "DestinacaoRecursosOfertasPublicas", "12.8"],
  ["TransacoesPartesRelacionadas", "OutrasInfRelev", "12.9"],
  ["ResponsaveisFormulario", "DeclaracaoDiretorPresidente", "13.1"],
  ["ResponsaveisFormulario", "DeclaracaoDiretorRelacoes", "13.1"],
  ["ResponsaveisFormulario", "DeclaracaoDiretorPresidenteRelacoes", "13.1"],
  ["ResponsaveisFormulario", "DeclaracaoDiretorPresidente132", "13.2"],
  ["ResponsaveisFormulario", "DeclaracaoDiretorRelacoes132", "13.2"],
  ["ResponsaveisFormulario", "DeclaracaoDiretorPresidenteRelacoes132", "13.2"],
];
const groupItemRows = (
  rows: readonly (readonly [FreSectionTag, string, string])[],
): ReadonlyMap<string, ReadonlyMap<string, string>> => {
  const sectionToItems = new Map<string, Map<string, string>>();
  for (const [section, element, item] of rows) {
    const elementToItem = sectionToItems.get(section) ?? new Map<string, string>();
    elementToItem.set(element, item);
    sectionToItems.set(section, elementToItem);
  }
  return sectionToItems;
};
const SECTION_TO_ELEMENT_TO_ITEM = groupItemRows(FRE_ITEM_ROWS);

export class FormReferenceService {
  static async extract(bytes: Uint8Array): Promise<ExtractedDocument> {
    // Why: a CVM reference form is a zip with one XML; the text of each item is a PDF inside that XML, so every chunk names its section and item, and its page is the page of that PDF.
    const xmls = ZipFileUtil.listEntriesFromBuffer(bytes)
      .filter((candidate) => candidate.name.toLowerCase().endsWith(XML_SUFFIX))
      .map((entry) => FormReferenceService.decodeXml(ZipFileUtil.readEntryFromBuffer(bytes, entry)));
    if (xmls.length === 0) {
      throw new Error("the form zip has no XML; no text was stored");
    }
    // Why: a real zip also holds FormularioCadastral.xml; the FRE is the XML whose root is XmlFormularioReferencia, not the first XML of the zip (issue #61, S10).
    const xml = xmls.find((text) => text.includes(FRE_ROOT));
    if (xml === undefined) {
      throw new Error("the form zip has no FRE XML (XmlFormularioReferencia); no text was stored");
    }
    const items = FormReferenceService.readItems(xml);
    if (items.length === 0) {
      throw new Error("the form XML has no PDF item; no text was stored");
    }
    const segments: ExtractedSegment[] = [];
    let pagesWithoutText = 0;
    for (const item of items) {
      // Why: the PDF reader takes a Uint8Array; a Buffer is refused, so the decoded bytes are copied into one.
      const document = await PdfTextService.extract(new Uint8Array(Buffer.from(item.content, "base64")));
      pagesWithoutText += document.pagesWithoutText;
      for (const segment of document.segments) {
        segments.push({ section: `${item.section} ${item.label}`, item: item.item, page: segment.page, text: segment.text });
      }
    }
    return { format: "form", pagesWithoutText, segments };
  }

  static readItems(xml: string): FormItem[] {
    const form = FormReferenceService.findForm(parse(xml));
    const items: FormItem[] = [];
    for (const section of FormReferenceService.readElements(form)) {
      for (const parent of FormReferenceService.walk(section)) {
        const children = FormReferenceService.readElements(parent);
        const names = children.filter((child) => child.rawTagName === NAME_TAG);
        const contents = children.filter((child) => child.rawTagName === CONTENT_TAG);
        names.forEach((name, index) => {
          const content = contents[index];
          // Why: an empty pair is a blank slot of the form, with no document in it; it is skipped, not read.
          if (content !== undefined && content.text.trim() !== "") {
            items.push({
              section: section.rawTagName,
              label: FormReferenceService.readLabel(name.text),
              content: content.text,
              item: FormReferenceService.readItemNumber(section, parent),
            });
          }
        });
      }
    }
    return items;
  }

  static readItemNumber(section: HTMLElement, parent: HTMLElement): string | null {
    // Why: the item number comes from the element that holds the PDF, never from its label; an element that is not in the table, or a PDF directly under its section tag, has no number (NULL).
    if (parent === section || !FormReferenceService.isFreSection(section.rawTagName)) {
      return null;
    }
    return SECTION_TO_ELEMENT_TO_ITEM.get(section.rawTagName)?.get(parent.rawTagName) ?? null;
  }

  private static isFreSection(tag: string): tag is FreSectionTag {
    return SECTION_TO_ELEMENT_TO_ITEM.has(tag);
  }

  private static decodeXml(bytes: Uint8Array): string {
    // Why: the XML is cp1252 although it declares UTF-8; reading it as UTF-8 would garble every accent of the body.
    return new TextDecoder(WINDOWS_1252).decode(bytes);
  }

  private static findForm(root: HTMLElement): HTMLElement {
    let node: HTMLElement | undefined = root;
    for (const tag of FORM_PATH) {
      node = FormReferenceService.readElements(node).find((child) => child.rawTagName === tag);
      if (node === undefined) {
        throw new Error(`the form XML has no ${FORM_PATH.join("/")}; no text was stored`);
      }
    }
    return node;
  }

  private static readLabel(name: string): string {
    // Why: the label is the item number as CVM names the file (for example 4.1), so a reader finds the item of the form it talks about.
    const label = TextUtil.repairUtf8(name.trim()).replace(PDF_SUFFIX, "").replace(DOCX_SUFFIX, "").trim();
    return label === "" ? UNNAMED_ITEM : label;
  }

  private static readElements(node: HTMLElement): HTMLElement[] {
    return node.childNodes.filter((child): child is HTMLElement => child instanceof HTMLElement);
  }

  private static walk(node: HTMLElement): HTMLElement[] {
    return [node, ...FormReferenceService.readElements(node).flatMap((child) => FormReferenceService.walk(child))];
  }
}
