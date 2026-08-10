export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          company_id: string | null
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json | null
          new_data: Json | null
          previous_data: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          company_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          new_data?: Json | null
          previous_data?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          company_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          new_data?: Json | null
          previous_data?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      addresses: {
        Row: {
          andar: string
          code: string
          company_id: string | null
          created_at: string
          face: string
          id: string
          is_active: boolean
          lado: string
          posicao: string
          rua: string
          type: Database["public"]["Enums"]["address_type"]
        }
        Insert: {
          andar: string
          code: string
          company_id?: string | null
          created_at?: string
          face: string
          id?: string
          is_active?: boolean
          lado: string
          posicao: string
          rua: string
          type?: Database["public"]["Enums"]["address_type"]
        }
        Update: {
          andar?: string
          code?: string
          company_id?: string | null
          created_at?: string
          face?: string
          id?: string
          is_active?: boolean
          lado?: string
          posicao?: string
          rua?: string
          type?: Database["public"]["Enums"]["address_type"]
        }
        Relationships: [
          {
            foreignKeyName: "addresses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          activation_checklist_dismissed: boolean
          address: string | null
          approval_reason: string | null
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          assisted_validation_at: string | null
          assisted_validation_by: string | null
          assisted_validation_note: string | null
          business_type: Database["public"]["Enums"]["business_type"]
          city: string | null
          controls_batch: boolean
          controls_expiration: boolean
          country: string | null
          created_at: string
          deployment_owner_id: string | null
          document_number: string | null
          email: string | null
          estimated_size: string | null
          estimated_users: string | null
          handles_perishables: boolean
          id: string
          invite_code: string | null
          legal_name: string | null
          logo_url: string | null
          main_focal_user_id: string | null
          max_addresses: number | null
          max_products: number | null
          max_users: number | null
          name: string
          notes: string | null
          onboarding_completed: boolean
          onboarding_completed_at: string | null
          onboarding_status: string
          onboarding_step: number
          operation_mode: Database["public"]["Enums"]["operation_mode"]
          phone: string | null
          plan: string
          plans_csv_import: boolean
          segment: string | null
          settings: Json
          state: string | null
          status: Database["public"]["Enums"]["company_status"]
          trade_name: string | null
          trial_ends_at: string | null
          updated_at: string
          uses_addressing: boolean
          uses_expedition: boolean
          whatsapp: string | null
        }
        Insert: {
          activation_checklist_dismissed?: boolean
          address?: string | null
          approval_reason?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          assisted_validation_at?: string | null
          assisted_validation_by?: string | null
          assisted_validation_note?: string | null
          business_type?: Database["public"]["Enums"]["business_type"]
          city?: string | null
          controls_batch?: boolean
          controls_expiration?: boolean
          country?: string | null
          created_at?: string
          deployment_owner_id?: string | null
          document_number?: string | null
          email?: string | null
          estimated_size?: string | null
          estimated_users?: string | null
          handles_perishables?: boolean
          id?: string
          invite_code?: string | null
          legal_name?: string | null
          logo_url?: string | null
          main_focal_user_id?: string | null
          max_addresses?: number | null
          max_products?: number | null
          max_users?: number | null
          name: string
          notes?: string | null
          onboarding_completed?: boolean
          onboarding_completed_at?: string | null
          onboarding_status?: string
          onboarding_step?: number
          operation_mode?: Database["public"]["Enums"]["operation_mode"]
          phone?: string | null
          plan?: string
          plans_csv_import?: boolean
          segment?: string | null
          settings?: Json
          state?: string | null
          status?: Database["public"]["Enums"]["company_status"]
          trade_name?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          uses_addressing?: boolean
          uses_expedition?: boolean
          whatsapp?: string | null
        }
        Update: {
          activation_checklist_dismissed?: boolean
          address?: string | null
          approval_reason?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          assisted_validation_at?: string | null
          assisted_validation_by?: string | null
          assisted_validation_note?: string | null
          business_type?: Database["public"]["Enums"]["business_type"]
          city?: string | null
          controls_batch?: boolean
          controls_expiration?: boolean
          country?: string | null
          created_at?: string
          deployment_owner_id?: string | null
          document_number?: string | null
          email?: string | null
          estimated_size?: string | null
          estimated_users?: string | null
          handles_perishables?: boolean
          id?: string
          invite_code?: string | null
          legal_name?: string | null
          logo_url?: string | null
          main_focal_user_id?: string | null
          max_addresses?: number | null
          max_products?: number | null
          max_users?: number | null
          name?: string
          notes?: string | null
          onboarding_completed?: boolean
          onboarding_completed_at?: string | null
          onboarding_status?: string
          onboarding_step?: number
          operation_mode?: Database["public"]["Enums"]["operation_mode"]
          phone?: string | null
          plan?: string
          plans_csv_import?: boolean
          segment?: string | null
          settings?: Json
          state?: string | null
          status?: Database["public"]["Enums"]["company_status"]
          trade_name?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          uses_addressing?: boolean
          uses_expedition?: boolean
          whatsapp?: string | null
        }
        Relationships: []
      }
      company_deployment_notes: {
        Row: {
          author_id: string
          category: string
          company_id: string
          created_at: string
          id: string
          note: string
          updated_at: string
        }
        Insert: {
          author_id: string
          category?: string
          company_id: string
          created_at?: string
          id?: string
          note: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          category?: string
          company_id?: string
          created_at?: string
          id?: string
          note?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_deployment_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_members: {
        Row: {
          approved_at: string | null
          blocked_at: string | null
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          is_main_focal_point: boolean
          role: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          blocked_at?: string | null
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_main_focal_point?: boolean
          role?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          blocked_at?: string | null
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_main_focal_point?: boolean
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      lots: {
        Row: {
          company_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          invoice_number: string | null
          lot_code: string
          manufacturing_date: string | null
          notes: string | null
          product_id: string
          received_at: string | null
          status: Database["public"]["Enums"]["lot_status"]
          supplier: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          invoice_number?: string | null
          lot_code: string
          manufacturing_date?: string | null
          notes?: string | null
          product_id: string
          received_at?: string | null
          status?: Database["public"]["Enums"]["lot_status"]
          supplier?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          invoice_number?: string | null
          lot_code?: string
          manufacturing_date?: string | null
          notes?: string | null
          product_id?: string
          received_at?: string | null
          status?: Database["public"]["Enums"]["lot_status"]
          supplier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      movements: {
        Row: {
          company_id: string | null
          created_at: string
          from_address_id: string | null
          id: string
          lot_id: string
          note: string | null
          operator_user_id: string | null
          product_id: string
          qty: number
          subtype: string | null
          to_address_id: string | null
          type: Database["public"]["Enums"]["movement_type"]
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          from_address_id?: string | null
          id?: string
          lot_id: string
          note?: string | null
          operator_user_id?: string | null
          product_id: string
          qty: number
          subtype?: string | null
          to_address_id?: string | null
          type: Database["public"]["Enums"]["movement_type"]
        }
        Update: {
          company_id?: string | null
          created_at?: string
          from_address_id?: string | null
          id?: string
          lot_id?: string
          note?: string | null
          operator_user_id?: string | null
          product_id?: string
          qty?: number
          subtype?: string | null
          to_address_id?: string | null
          type?: Database["public"]["Enums"]["movement_type"]
        }
        Relationships: [
          {
            foreignKeyName: "movements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_from_address_id_fkey"
            columns: ["from_address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_to_address_id_fkey"
            columns: ["to_address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          category: string
          company_id: string | null
          created_at: string
          id: string
          is_read: boolean
          message: string | null
          metadata: Json
          severity: Database["public"]["Enums"]["notification_severity"]
          title: string
          user_id: string | null
        }
        Insert: {
          category?: string
          company_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          metadata?: Json
          severity?: Database["public"]["Enums"]["notification_severity"]
          title: string
          user_id?: string | null
        }
        Update: {
          category?: string
          company_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          metadata?: Json
          severity?: Database["public"]["Enums"]["notification_severity"]
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      picking_list_items: {
        Row: {
          company_id: string
          created_at: string
          from_address_id: string | null
          id: string
          lot_id: string | null
          movement_id: string | null
          picked_qty: number
          picking_list_id: string
          product_id: string
          requested_qty: number
          sort_order: number
          status: Database["public"]["Enums"]["picking_item_status"]
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          from_address_id?: string | null
          id?: string
          lot_id?: string | null
          movement_id?: string | null
          picked_qty?: number
          picking_list_id: string
          product_id: string
          requested_qty: number
          sort_order?: number
          status?: Database["public"]["Enums"]["picking_item_status"]
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          from_address_id?: string | null
          id?: string
          lot_id?: string | null
          movement_id?: string | null
          picked_qty?: number
          picking_list_id?: string
          product_id?: string
          requested_qty?: number
          sort_order?: number
          status?: Database["public"]["Enums"]["picking_item_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "picking_list_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picking_list_items_from_address_id_fkey"
            columns: ["from_address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picking_list_items_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picking_list_items_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picking_list_items_picking_list_id_fkey"
            columns: ["picking_list_id"]
            isOneToOne: false
            referencedRelation: "picking_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picking_list_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      picking_lists: {
        Row: {
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          customer: string | null
          id: string
          notes: string | null
          reference: string
          status: Database["public"]["Enums"]["picking_list_status"]
          updated_at: string
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer?: string | null
          id?: string
          notes?: string | null
          reference: string
          status?: Database["public"]["Enums"]["picking_list_status"]
          updated_at?: string
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer?: string | null
          id?: string
          notes?: string | null
          reference?: string
          status?: Database["public"]["Enums"]["picking_list_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "picking_lists_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_staff_invites: {
        Row: {
          approved_at: string | null
          created_at: string
          email: string
          expires_at: string
          full_name: string | null
          id: string
          intended_role: Database["public"]["Enums"]["app_role"]
          invited_by: string | null
          registered_at: string | null
          registered_user_id: string | null
          revoked_at: string | null
          status: string
          token_hash: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          full_name?: string | null
          id?: string
          intended_role: Database["public"]["Enums"]["app_role"]
          invited_by?: string | null
          registered_at?: string | null
          registered_user_id?: string | null
          revoked_at?: string | null
          status?: string
          token_hash?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          full_name?: string | null
          id?: string
          intended_role?: Database["public"]["Enums"]["app_role"]
          invited_by?: string | null
          registered_at?: string | null
          registered_user_id?: string | null
          revoked_at?: string | null
          status?: string
          token_hash?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          barcode: string | null
          brand: string | null
          category: string | null
          classification:
            | Database["public"]["Enums"]["product_classification"]
            | null
          company_id: string | null
          controls_batch: boolean
          controls_expiration: boolean
          created_at: string
          description: string
          id: string
          image_url: string | null
          internal_code: string | null
          is_active: boolean
          is_perishable: boolean
          max_temperature: number | null
          min_stock: number
          min_temperature: number | null
          ncm: string | null
          notes: string | null
          price: number
          product_type: Database["public"]["Enums"]["product_type"]
          shelf_life_days: number | null
          sku: string
          storage_condition: string | null
          subcategory: string | null
          temperature_control_required: boolean
          unit: string
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          category?: string | null
          classification?:
            | Database["public"]["Enums"]["product_classification"]
            | null
          company_id?: string | null
          controls_batch?: boolean
          controls_expiration?: boolean
          created_at?: string
          description: string
          id?: string
          image_url?: string | null
          internal_code?: string | null
          is_active?: boolean
          is_perishable?: boolean
          max_temperature?: number | null
          min_stock?: number
          min_temperature?: number | null
          ncm?: string | null
          notes?: string | null
          price?: number
          product_type?: Database["public"]["Enums"]["product_type"]
          shelf_life_days?: number | null
          sku: string
          storage_condition?: string | null
          subcategory?: string | null
          temperature_control_required?: boolean
          unit?: string
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          category?: string | null
          classification?:
            | Database["public"]["Enums"]["product_classification"]
            | null
          company_id?: string | null
          controls_batch?: boolean
          controls_expiration?: boolean
          created_at?: string
          description?: string
          id?: string
          image_url?: string | null
          internal_code?: string | null
          is_active?: boolean
          is_perishable?: boolean
          max_temperature?: number | null
          min_stock?: number
          min_temperature?: number | null
          ncm?: string | null
          notes?: string | null
          price?: number
          product_type?: Database["public"]["Enums"]["product_type"]
          shelf_life_days?: number | null
          sku?: string
          storage_condition?: string | null
          subcategory?: string | null
          temperature_control_required?: boolean
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_type: string
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_approved: boolean
          notify_daily_summary: boolean
          notify_min_stock: boolean
          rejection_reason: string | null
          updated_at: string
          whatsapp_number: string | null
        }
        Insert: {
          account_type?: string
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          is_approved?: boolean
          notify_daily_summary?: boolean
          notify_min_stock?: boolean
          rejection_reason?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Update: {
          account_type?: string
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_approved?: boolean
          notify_daily_summary?: boolean
          notify_min_stock?: boolean
          rejection_reason?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      stock_balance: {
        Row: {
          address_id: string
          company_id: string | null
          id: string
          last_movement_at: string
          lot_id: string
          product_id: string
          qty: number
          updated_at: string
        }
        Insert: {
          address_id: string
          company_id?: string | null
          id?: string
          last_movement_at?: string
          lot_id: string
          product_id: string
          qty?: number
          updated_at?: string
        }
        Update: {
          address_id?: string
          company_id?: string | null
          id?: string
          last_movement_at?: string
          lot_id?: string
          product_id?: string
          qty?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_balance_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_balance_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_balance_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_balance_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_messages: {
        Row: {
          created_at: string
          id: string
          is_internal: boolean
          message: string
          sender_id: string
          ticket_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_internal?: boolean
          message: string
          sender_id: string
          ticket_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_internal?: boolean
          message?: string
          sender_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          category: string
          closed_at: string | null
          company_id: string
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          created_by: string
          description: string
          id: string
          module: string | null
          priority: Database["public"]["Enums"]["support_ticket_priority"]
          status: Database["public"]["Enums"]["support_ticket_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category?: string
          closed_at?: string | null
          company_id: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by: string
          description: string
          id?: string
          module?: string | null
          priority?: Database["public"]["Enums"]["support_ticket_priority"]
          status?: Database["public"]["Enums"]["support_ticket_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category?: string
          closed_at?: string | null
          company_id?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          module?: string | null
          priority?: Database["public"]["Enums"]["support_ticket_priority"]
          status?: Database["public"]["Enums"]["support_ticket_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      system_changelog: {
        Row: {
          affected_modules: string[]
          change_type: Database["public"]["Enums"]["changelog_change_type"]
          created_at: string
          created_by: string | null
          description: string
          id: string
          is_public: boolean
          title: string
          version: string | null
        }
        Insert: {
          affected_modules?: string[]
          change_type?: Database["public"]["Enums"]["changelog_change_type"]
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          is_public?: boolean
          title: string
          version?: string | null
        }
        Update: {
          affected_modules?: string[]
          change_type?: Database["public"]["Enums"]["changelog_change_type"]
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          is_public?: boolean
          title?: string
          version?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_tab_permissions: {
        Row: {
          created_at: string
          id: string
          is_allowed: boolean
          tab_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_allowed?: boolean
          tab_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_allowed?: boolean
          tab_key?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      account_set_approval: {
        Args: { _approved: boolean; _reason?: string; _user_id: string }
        Returns: Json
      }
      account_set_type: {
        Args: { _account_type: string; _user_id: string }
        Returns: Json
      }
      approve_company: { Args: { _company_id: string }; Returns: undefined }
      can_manage_company_members: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      company_member_add_by_email: {
        Args: { _company_id: string; _email: string; _role: string }
        Returns: Json
      }
      company_member_set_active: {
        Args: { _active: boolean; _company_id: string; _member_id: string }
        Returns: Json
      }
      company_member_set_focal: {
        Args: { _company_id: string; _member_id: string }
        Returns: Json
      }
      company_member_set_role: {
        Args: { _company_id: string; _member_id: string; _role: string }
        Returns: Json
      }
      company_transfer_ownership: {
        Args: { _company_id: string; _new_owner_member_id: string }
        Returns: Json
      }
      deployment_complete_validation: {
        Args: { _company_id: string; _note?: string }
        Returns: Json
      }
      deployment_detail: { Args: { _company_id: string }; Returns: Json }
      deployment_overview: { Args: never; Returns: Json }
      deployment_set_owner: {
        Args: { _company_id: string; _user_id: string }
        Returns: Json
      }
      get_user_company_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_company_admin_of: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      is_member_of: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      is_platform_client_admin: { Args: { _user_id: string }; Returns: boolean }
      is_platform_staff: { Args: { _user_id: string }; Returns: boolean }
      is_platform_super_admin: { Args: { _user_id: string }; Returns: boolean }
      is_support_staff: { Args: { _user_id: string }; Returns: boolean }
      mark_support_center_viewed: {
        Args: { _company_id: string }
        Returns: boolean
      }
      platform_access_diagnostics: { Args: never; Returns: Json }
      platform_cleanup_execute: {
        Args: { _caller_id: string; _company_ids: string[] }
        Returns: Json
      }
      platform_cleanup_inventory: {
        Args: { _caller_id: string }
        Returns: Json
      }
      platform_cleanup_preview: {
        Args: { _caller_id: string; _company_ids: string[] }
        Returns: Json
      }
      platform_reset_execute: { Args: { _caller_id: string }; Returns: Json }
      platform_reset_preview: { Args: { _caller_id: string }; Returns: Json }
      reject_company: {
        Args: { _company_id: string; _reason: string }
        Returns: undefined
      }
      staff_add_existing_account: {
        Args: { _role: string; _user_id: string }
        Returns: Json
      }
      staff_invite_activate: { Args: { _invite_id: string }; Returns: Json }
      staff_invite_create: {
        Args: { _email: string; _full_name: string; _role: string }
        Returns: Json
      }
      staff_invite_revoke: { Args: { _invite_id: string }; Returns: Json }
      staff_role_apply: {
        Args: { _mode?: string; _role: string; _user_id: string }
        Returns: Json
      }
      staff_role_remove: {
        Args: { _role: string; _user_id: string }
        Returns: Json
      }
    }
    Enums: {
      address_type: "ARMAZENAGEM" | "TECNICO"
      app_role:
        | "operator"
        | "supervisor"
        | "admin"
        | "super_admin"
        | "platform_admin"
        | "support_agent"
        | "developer"
      business_type:
        | "bakery"
        | "retail"
        | "distributor"
        | "warehouse"
        | "logistics_center"
        | "other"
      changelog_change_type:
        | "feature"
        | "fix"
        | "security"
        | "database"
        | "ui"
        | "performance"
        | "refactor"
      company_status: "active" | "inactive" | "blocked" | "trial"
      lot_status: "active" | "blocked" | "expired" | "consumed" | "quarantined"
      movement_type: "IN" | "OUT" | "TRANSFER"
      notification_severity: "info" | "warning" | "critical"
      operation_mode: "essential" | "operations" | "wms"
      picking_item_status: "pending" | "picked" | "skipped"
      picking_list_status: "draft" | "in_progress" | "done" | "cancelled"
      product_classification:
        | "perishable"
        | "non_perishable"
        | "consumer_good"
        | "controlled_validity"
        | "technical_item"
        | "fragile"
        | "hazardous"
        | "frozen"
        | "refrigerated"
        | "dry_storage"
        | "other"
      product_type:
        | "raw_material"
        | "finished_product"
        | "resale_product"
        | "consumable"
        | "packaging"
        | "spare_part"
        | "service_item"
        | "other"
      support_ticket_priority: "low" | "medium" | "high" | "critical"
      support_ticket_status:
        | "open"
        | "in_progress"
        | "waiting_customer"
        | "resolved"
        | "closed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      address_type: ["ARMAZENAGEM", "TECNICO"],
      app_role: [
        "operator",
        "supervisor",
        "admin",
        "super_admin",
        "platform_admin",
        "support_agent",
        "developer",
      ],
      business_type: [
        "bakery",
        "retail",
        "distributor",
        "warehouse",
        "logistics_center",
        "other",
      ],
      changelog_change_type: [
        "feature",
        "fix",
        "security",
        "database",
        "ui",
        "performance",
        "refactor",
      ],
      company_status: ["active", "inactive", "blocked", "trial"],
      lot_status: ["active", "blocked", "expired", "consumed", "quarantined"],
      movement_type: ["IN", "OUT", "TRANSFER"],
      notification_severity: ["info", "warning", "critical"],
      operation_mode: ["essential", "operations", "wms"],
      picking_item_status: ["pending", "picked", "skipped"],
      picking_list_status: ["draft", "in_progress", "done", "cancelled"],
      product_classification: [
        "perishable",
        "non_perishable",
        "consumer_good",
        "controlled_validity",
        "technical_item",
        "fragile",
        "hazardous",
        "frozen",
        "refrigerated",
        "dry_storage",
        "other",
      ],
      product_type: [
        "raw_material",
        "finished_product",
        "resale_product",
        "consumable",
        "packaging",
        "spare_part",
        "service_item",
        "other",
      ],
      support_ticket_priority: ["low", "medium", "high", "critical"],
      support_ticket_status: [
        "open",
        "in_progress",
        "waiting_customer",
        "resolved",
        "closed",
      ],
    },
  },
} as const
