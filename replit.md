# OBTV Studio Manager

## Overview

OBTV Studio Manager is a modern web application designed for managing multiple television studio operations with live streaming capabilities. The application provides a comprehensive dashboard for monitoring and controlling studio streams, with role-based access control for different types of users (admin, operator, viewer). Built with a full-stack TypeScript architecture, it combines a React frontend with an Express.js backend and PostgreSQL database to deliver a robust studio management platform.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The client-side application is built using React with TypeScript, leveraging modern web development practices:
- **UI Framework**: React with functional components and hooks
- **Build Tool**: Vite for fast development and optimized production builds
- **Styling**: Tailwind CSS with shadcn/ui component library for consistent design
- **State Management**: TanStack Query (React Query) for server state management and data fetching
- **Routing**: Wouter for lightweight client-side routing
- **Mobile Support**: Touch gesture handlers for mobile/tablet interaction with pinch-to-zoom and swipe navigation
- **Design System**: Custom color palette with studio-specific theming (SoCal, Plex, Irving, Nashville)

### Backend Architecture  
The server-side follows a RESTful API design pattern:
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **Authentication**: JWT-based authentication with bcrypt password hashing
- **Session Management**: Express sessions with PostgreSQL store
- **Database Layer**: Drizzle ORM for type-safe database operations
- **API Design**: Resource-based endpoints with proper HTTP status codes and error handling
- **Middleware**: Request logging, authentication guards, and role-based access control

### Data Storage Solutions
The application uses a PostgreSQL database with the following design principles:
- **ORM**: Drizzle ORM with type-safe schema definitions
- **Database Provider**: Neon Database with serverless connection pooling
- **Schema Management**: Migration-based database versioning
- **Data Models**: Users, Studios, Streams, and UserStudioPermissions with proper foreign key relationships
- **Storage Interface**: Abstract storage layer for potential database provider switching

### Authentication and Authorization
Multi-layered security approach:
- **Authentication**: JWT tokens stored in localStorage with automatic refresh
- **Password Security**: bcrypt hashing with salt rounds
- **Role-Based Access**: Three user roles (admin, operator, viewer) with hierarchical permissions
- **Studio Permissions**: Granular permissions system allowing users access to specific studios
- **API Protection**: Middleware-based route protection with role verification
- **Session Management**: HTTP-only cookies for session persistence

### External Dependencies
The application integrates with several key external services and technologies:
- **Database**: Neon PostgreSQL for serverless database hosting
- **Streaming Protocol**: WebRTC-based streaming with WHEP (WebRTC HTTP Egress Protocol) support
- **SRS Integration**: Simple Realtime Server SDK for WebRTC streaming capabilities
- **UI Components**: Radix UI primitives for accessible component foundations
- **Development Tools**: Replit integration for development environment support
- **Build Pipeline**: ESBuild for server bundling and Vite for client bundling

The system is designed to be scalable and maintainable, with clear separation of concerns between the frontend presentation layer, backend business logic, and data persistence layer. The streaming architecture supports real-time video delivery with fallback mechanisms and mobile-optimized playback controls.