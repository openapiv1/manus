# Gemini Computer Use Demo

## Overview

This is an AI-powered computer control application that allows users to interact with a virtual desktop environment through natural language commands. The application uses Google Gemini 2.5 Flash to understand user requests and execute actions on a sandboxed Ubuntu desktop provided by E2B. Built with Next.js 15, it features real-time streaming responses and a modern UI powered by shadcn/ui components.

## Recent Changes

**2025-10-01**: Ulepszone instrukcje systemowe dla automatycznych zrzutów ekranu
- AI będzie automatycznie robił zrzuty ekranu co 2-3 akcje
- Jasne instrukcje o używaniu OBIE narzędzi (bash_command i computer_use)
- Dodane workflow z automatycznym sprawdzaniem stanu sandboxa
- Zmieniony port serwera na 5000 (zgodnie z polityką Replit)

**2025-09-30**: Enhanced Gemini sandbox control implementation
- Improved screenshot action to send screenshot-update events for immediate UI updates
- Enhanced bash_command to capture both stdout and stderr for better error visibility
- Added comprehensive error handling with proper error message extraction
- Added default case for unknown actions with console warnings
- Confirmed all sandbox control functions working correctly (click, type, key, scroll, drag, screenshot, bash_command)

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: Next.js 15 App Router with React 19
- Server and client components are separated appropriately
- Real-time UI updates using React hooks and state management
- Responsive design with mobile and desktop layouts using ResizablePanels

**UI Components**: shadcn/ui with Tailwind CSS 4
- New York style variant with custom theming
- Dark mode support via next-themes
- Toast notifications using Sonner
- Motion animations using Framer Motion (motion package)
- Markdown rendering for AI responses with react-markdown

**State Management**: Custom React hooks
- `useCustomChat`: Manages chat messages, streaming, and API communication
- `useScrollToBottom`: Auto-scrolls to latest messages using MutationObserver
- Local state for sandbox initialization and stream URLs

### Backend Architecture

**AI Integration**: Google Generative AI SDK with Gemini Models
- Primary model: gemini-2.5-flash via Google AI Studio
- Streaming responses for real-time user feedback with incremental function call argument accumulation
- System instructions in Polish for assistant personality ("Surf")
- Token budget management (200,000 token budget specified)
- Hardcoded API key: AIzaSyA_8oLS-4FgJJ9-x7l5_xl1RORmJyUUKzw

**Computer Control Tools**:
1. `computer_use`: Screenshot capture, mouse control, keyboard input, scrolling
2. `bash_command`: Terminal command execution in sandbox

**Sandbox Environment**: E2B Desktop
- Isolated Ubuntu 22.04 virtual machines
- Pre-configured with Firefox, VS Code, LibreOffice, Python
- Custom resolution support (1024x768 default)
- Stream URL generation for real-time desktop viewing
- Sandbox lifecycle management (create, connect, kill)

**API Routes**:
- `/api/chat`: Main chat endpoint with streaming support (300s max duration)
- `/api/kill-desktop`: Sandbox cleanup endpoint

### Design Patterns

**Streaming Architecture**:
- Server-sent events for real-time AI responses
- Abort controller pattern for cancelling in-flight requests
- Separate streaming handlers for desktop and mobile views

**Security**:
- Content Security Policy headers configured for E2B frame embedding
- X-Frame-Options set to SAMEORIGIN
- Sandboxed execution environment for all computer operations

**Error Handling**:
- Toast notifications for user-facing errors
- Console logging for debugging
- Graceful degradation when sandbox unavailable

**Code Organization**:
- Separation of concerns: UI components, business logic, API routes
- Utility functions centralized in `/lib`
- Type definitions using TypeScript
- Path aliases for clean imports (@/ prefix)

## External Dependencies

### AI Services
- **Google AI Studio**: Gemini AI model hosting
  - API Key: AIzaSyA_8oLS-4FgJJ9-x7l5_xl1RORmJyUUKzw (hardcoded as per user requirement)
  - Model: gemini-2.5-flash
  - Uses @google/generative-ai SDK
  - Streaming function calls with incremental argument buffering

### Infrastructure Services
- **E2B Desktop Sandbox**: Virtual desktop environment
  - API Key: e2b_8a5c7099485b881be08b594be7b7574440adf09c
  - Provides Ubuntu 22.04 isolated VMs
  - Stream URLs for desktop viewing
  - Sandbox lifecycle management

### Third-Party Libraries
- **@google/generative-ai**: Google Gemini integration for AI-powered computer control
- **Vercel Analytics**: Usage tracking
- **Zod**: Schema validation
- **shadcn/ui components**: Pre-built UI components (Radix UI primitives)
- **Tailwind CSS**: Styling framework
- **react-markdown**: Markdown rendering with GitHub Flavored Markdown support

### Development Tools
- TypeScript for type safety
- ESLint for code quality
- Next.js built-in optimizations (image, font loading)