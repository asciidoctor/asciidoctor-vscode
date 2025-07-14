import { Memento, Uri } from 'vscode'
import { AntoraConfig, AntoraDocumentContext } from './antoraContext'

export async function findAntoraConfigFile(_: Uri): Promise<Uri | undefined> {
  return undefined
}

export async function antoraConfigFileExists(_: Uri): Promise<boolean> {
  return false
}

export async function getAntoraConfig(
  textDocumentUri: Uri,
): Promise<AntoraConfig | undefined> {
  return new AntoraConfig(textDocumentUri, {})
}

export async function getAttributes(
  _: Uri,
): Promise<{ [key: string]: string }> {
  return {}
}

export async function getAntoraDocumentContext(
  _: Uri,
  __: Memento,
): Promise<AntoraDocumentContext | undefined> {
  return undefined
}
