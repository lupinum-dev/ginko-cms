<script setup lang="ts">
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bold,
  Bot,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Code,
  Copy,
  Database,
  Eye,
  EyeOff,
  File,
  FileArchive,
  FileText,
  Folder,
  Globe,
  History,
  Image,
  Inbox,
  Italic,
  Layers,
  LayoutList,
  Link,
  List,
  ListOrdered,
  Monitor,
  Moon,
  Quote,
  Settings,
  SquareCode,
  Star,
  Strikethrough,
  Sun,
  X,
  XCircle,
  Zap,
} from '@lucide/vue'
import { computed } from 'vue'

const props = defineProps<{
  name?: string
}>()

const lucideComponents = {
  'lucide:activity': Activity,
  'lucide:alert-triangle': AlertTriangle,
  'lucide:arrow-right': ArrowRight,
  'lucide:bold': Bold,
  'lucide:bot': Bot,
  'lucide:check': Check,
  'lucide:check-circle': CheckCircle,
  'lucide:chevron-down': ChevronDown,
  'lucide:chevron-right': ChevronRight,
  'lucide:code': Code,
  'lucide:copy': Copy,
  'lucide:database': Database,
  'lucide:eye': Eye,
  'lucide:eye-off': EyeOff,
  'lucide:file': File,
  'lucide:file-archive': FileArchive,
  'lucide:file-text': FileText,
  'lucide:folder': Folder,
  'lucide:globe': Globe,
  'lucide:history': History,
  'lucide:image': Image,
  'lucide:inbox': Inbox,
  'lucide:italic': Italic,
  'lucide:layers': Layers,
  'lucide:layout-list': LayoutList,
  'lucide:link': Link,
  'lucide:list': List,
  'lucide:list-ordered': ListOrdered,
  'lucide:monitor': Monitor,
  'lucide:moon': Moon,
  'lucide:quote': Quote,
  'lucide:settings': Settings,
  'lucide:square-code': SquareCode,
  'lucide:star': Star,
  'lucide:strikethrough': Strikethrough,
  'lucide:sun': Sun,
  'lucide:x': X,
  'lucide:x-circle': XCircle,
  'lucide:zap': Zap,
} as const

const lucideComponent = computed(() =>
  props.name ? lucideComponents[props.name as keyof typeof lucideComponents] : null,
)
const flagName = computed(() =>
  props.name === 'circle-flags:de' || props.name === 'circle-flags:gb' ? props.name : null,
)
</script>

<template>
  <component :is="lucideComponent" v-if="lucideComponent" aria-hidden="true" />
  <svg
    v-else-if="flagName === 'circle-flags:de'"
    aria-hidden="true"
    role="img"
    viewBox="0 0 512 512"
  >
    <mask id="ginkoFlagDe">
      <circle cx="256" cy="256" r="256" fill="#fff" />
    </mask>
    <g mask="url(#ginkoFlagDe)">
      <path fill="#ffda44" d="m0 345l256.7-25.5L512 345v167H0z" />
      <path fill="#d80027" d="m0 167l255-23l257 23v178H0z" />
      <path fill="#333" d="M0 0h512v167H0z" />
    </g>
  </svg>
  <svg
    v-else-if="flagName === 'circle-flags:gb'"
    aria-hidden="true"
    role="img"
    viewBox="0 0 512 512"
  >
    <mask id="ginkoFlagGb">
      <circle cx="256" cy="256" r="256" fill="#fff" />
    </mask>
    <g mask="url(#ginkoFlagGb)">
      <path
        fill="#eee"
        d="m0 0l8 22l-8 23v23l32 54l-32 54v32l32 48l-32 48v32l32 54l-32 54v68l22-8l23 8h23l54-32l54 32h32l48-32l48 32h32l54-32l54 32h68l-8-22l8-23v-23l-32-54l32-54v-32l-32-48l32-48v-32l-32-54l32-54V0l-22 8l-23-8h-23l-54 32l-54-32h-32l-48 32l-48-32h-32l-54 32L68 0H0z"
      />
      <path
        fill="#0052b4"
        d="M336 0v108L444 0Zm176 68L404 176h108zM0 176h108L0 68ZM68 0l108 108V0Zm108 512V404L68 512ZM0 444l108-108H0Zm512-108H404l108 108Zm-68 176L336 404v108z"
      />
      <path
        fill="#d80027"
        d="M0 0v45l131 131h45L0 0zm208 0v208H0v96h208v208h96V304h208v-96H304V0h-96zm259 0L336 131v45L512 0h-45zM176 336L0 512h45l131-131v-45zm160 0l176 176v-45L381 336h-45z"
      />
    </g>
  </svg>
  <span v-else aria-hidden="true" />
</template>
