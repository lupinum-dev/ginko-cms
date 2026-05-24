import type { JsonRecord } from '../types'

export interface MDCText {
  type: 'text'
  value: string
}

export interface MDCComment {
  type: 'comment'
  value?: string
}

export interface MDCElement {
  type: 'element'
  tag: string
  props?: JsonRecord
  children?: MDCNode[]
}

export interface MDCRoot {
  type: 'root'
  children: MDCNode[]
}

export type MDCNode = MDCElement | MDCText | MDCComment
