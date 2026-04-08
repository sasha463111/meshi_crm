'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  MessageCircle, Send, Phone, ArrowRight, Search, RefreshCw,
  User, Plus, Paperclip, FileText, Image as ImageIcon
} from 'lucide-react'
import { useState, useEffect, useRef } from 'react'

interface Chat {
  id: string
  name?: string | null
  lastMessage?: string | null
  unreadCount?: number
  timestamp?: number
}

interface ChatMessage {
  id: string
  fromMe: boolean
  text: string
  timestamp: number
  pushName: string
}

export default function WhatsAppPage() {
  const queryClient = useQueryClient()
  const [selectedChat, setSelectedChat] = useState<string | null>(null)
  const [selectedChatName, setSelectedChatName] = useState<string>('')
  const [message, setMessage] = useState('')
  const [newChatPhone, setNewChatPhone] = useState('')
  const [showNewChat, setShowNewChat] = useState(false)
  const [chatSearch, setChatSearch] = useState('')
  const [showAttach, setShowAttach] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fetch chats from Evolution API
  const { data: chats, isLoading: chatsLoading, refetch: refetchChats } = useQuery({
    queryKey: ['whatsapp-chats'],
    queryFn: async () => {
      const res = await fetch('/api/whatsapp/chats', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to fetch chats')
      return res.json() as Promise<Chat[]>
    },
    refetchInterval: 30000,
  })

  // Fetch messages for selected chat
  const { data: chatMessages, isLoading: messagesLoading } = useQuery({
    queryKey: ['whatsapp-chat-messages', selectedChat],
    queryFn: async () => {
      if (!selectedChat) return []
      const res = await fetch('/api/whatsapp/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remoteJid: selectedChat }),
      })
      if (!res.ok) throw new Error('Failed to fetch messages')
      return res.json() as Promise<ChatMessage[]>
    },
    enabled: !!selectedChat,
    refetchInterval: 10000,
  })

  // Send text message
  const sendMutation = useMutation({
    mutationFn: async ({ phone, text }: { phone: string; text: string }) => {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, message: text }),
      })
      if (!res.ok) throw new Error('Failed to send')
      return res.json()
    },
    onSuccess: () => {
      setMessage('')
      queryClient.invalidateQueries({ queryKey: ['whatsapp-chat-messages', selectedChat] })
      queryClient.invalidateQueries({ queryKey: ['whatsapp-chats'] })
    },
  })

  // Send document/media
  const sendMediaMutation = useMutation({
    mutationFn: async ({ phone, file }: { phone: string; file: File }) => {
      const formData = new FormData()
      formData.append('phone', phone)
      formData.append('file', file)
      const res = await fetch('/api/whatsapp/send-media', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) throw new Error('Failed to send media')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-chat-messages', selectedChat] })
      queryClient.invalidateQueries({ queryKey: ['whatsapp-chats'] })
      setShowAttach(false)
    },
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const phoneFromJid = (jid: string) => jid.replace('@s.whatsapp.net', '')

  const formatPhone = (phone: string) => {
    if (phone.startsWith('972')) {
      const local = '0' + phone.slice(3)
      return local.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3')
    }
    return phone
  }

  const handleSend = () => {
    if (!message.trim()) return
    if (showNewChat && newChatPhone) {
      sendMutation.mutate({ phone: newChatPhone, text: message })
      setShowNewChat(false)
      setNewChatPhone('')
    } else if (selectedChat) {
      sendMutation.mutate({ phone: phoneFromJid(selectedChat), text: message })
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedChat) return
    sendMediaMutation.mutate({ phone: phoneFromJid(selectedChat), file })
    e.target.value = ''
  }

  const formatTimestamp = (ts: number) => {
    if (!ts) return ''
    const date = new Date(ts * 1000)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()
    if (isToday) {
      return date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
    }
    return date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }) + ' ' +
           date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  }

  const filteredChats = chats?.filter((chat: Chat) => {
    if (!chatSearch) return true
    const phone = phoneFromJid(chat.id)
    const name = chat.name || ''
    return phone.includes(chatSearch) || name.toLowerCase().includes(chatSearch.toLowerCase()) || formatPhone(phone).includes(chatSearch)
  })

  const handleSelectChat = (chat: Chat) => {
    const phone = phoneFromJid(chat.id)
    setSelectedChat(chat.id)
    setSelectedChatName(chat.name || formatPhone(phone))
  }

  const handleBack = () => {
    setSelectedChat(null)
    setSelectedChatName('')
  }

  // ===== CHAT VIEW =====
  if (selectedChat) {
    const phone = phoneFromJid(selectedChat)
    return (
      <div className="flex flex-col rounded-xl border overflow-hidden" style={{ height: 'calc(100vh - 100px)' }}>
        {/* Chat Header - WhatsApp style dark green */}
        <div className="flex items-center gap-3 px-3 py-2.5 bg-[#075E54] text-white shrink-0">
          <Button size="icon" variant="ghost" className="size-8 text-white hover:bg-white/20" onClick={handleBack}>
            <ArrowRight className="size-4" />
          </Button>
          <div className="flex size-10 items-center justify-center rounded-full bg-white/20 shrink-0">
            <User className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{selectedChatName}</p>
            <p className="text-xs text-white/70" dir="ltr">{formatPhone(phone)}</p>
          </div>
          <a href={`tel:${phone}`}>
            <Button size="icon" variant="ghost" className="size-8 text-white hover:bg-white/20">
              <Phone className="size-4" />
            </Button>
          </a>
        </div>

        {/* Messages - WhatsApp wallpaper style */}
        <div
          className="flex-1 overflow-y-auto p-3 space-y-1.5"
          style={{ backgroundColor: '#ECE5DD' }}
        >
          {messagesLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
                  <Skeleton className="h-10 w-48 rounded-lg" />
                </div>
              ))}
            </div>
          ) : !chatMessages?.length ? (
            <div className="flex items-center justify-center h-full">
              <div className="bg-white/80 rounded-lg px-4 py-2 text-sm text-gray-500">
                אין הודעות עדיין. שלח הודעה ראשונה!
              </div>
            </div>
          ) : (
            chatMessages.map((msg: ChatMessage) => (
              <div
                key={msg.id || msg.timestamp}
                className={`flex ${msg.fromMe ? 'justify-start' : 'justify-end'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-2.5 py-1.5 text-sm shadow-sm relative ${
                    msg.fromMe
                      ? 'bg-[#DCF8C6] text-gray-900'
                      : 'bg-white text-gray-900'
                  }`}
                >
                  {!msg.fromMe && msg.pushName && (
                    <p className="text-xs font-semibold text-[#075E54] mb-0.5">
                      {msg.pushName}
                    </p>
                  )}
                  {/* Detect message types */}
                  {msg.text.startsWith('[תמונה]') ? (
                    <div className="flex items-center gap-1.5 text-blue-600">
                      <ImageIcon className="size-4" />
                      <span>{msg.text.replace('[תמונה]', '').trim() || 'תמונה'}</span>
                    </div>
                  ) : msg.text.startsWith('[מסמך]') ? (
                    <div className="flex items-center gap-1.5 text-blue-600">
                      <FileText className="size-4" />
                      <span>{msg.text.replace('[מסמך]', '').trim() || 'מסמך'}</span>
                    </div>
                  ) : msg.text.startsWith('[הודעה קולית]') ? (
                    <div className="flex items-center gap-1.5 text-gray-500">
                      <span>🎙️ הודעה קולית</span>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                  )}
                  <p className={`text-[10px] mt-0.5 text-end text-gray-500`} dir="ltr">
                    {formatTimestamp(msg.timestamp)}
                    {msg.fromMe && ' ✓✓'}
                  </p>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input - WhatsApp style */}
        <div className="p-2 bg-[#F0F0F0] shrink-0">
          <div className="flex items-end gap-2">
            {/* Attachment button */}
            <div className="relative">
              <Button
                size="icon"
                variant="ghost"
                className="size-9 rounded-full text-gray-600"
                onClick={() => setShowAttach(!showAttach)}
              >
                <Paperclip className="size-5" />
              </Button>
              {showAttach && (
                <div className="absolute bottom-12 start-0 bg-white rounded-xl shadow-lg border p-2 flex flex-col gap-1 z-10 min-w-[140px]">
                  <button
                    className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 text-sm"
                    onClick={() => {
                      if (fileInputRef.current) {
                        fileInputRef.current.accept = 'image/*'
                        fileInputRef.current.click()
                      }
                    }}
                  >
                    <ImageIcon className="size-4 text-purple-600" />
                    <span>תמונה</span>
                  </button>
                  <button
                    className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 text-sm"
                    onClick={() => {
                      if (fileInputRef.current) {
                        fileInputRef.current.accept = '.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv'
                        fileInputRef.current.click()
                      }
                    }}
                  >
                    <FileText className="size-4 text-blue-600" />
                    <span>מסמך</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                </div>
              )}
            </div>

            {/* Text input */}
            <textarea
              placeholder="כתוב הודעה..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={1}
              className="flex-1 min-h-[40px] max-h-[100px] resize-none rounded-2xl bg-white px-4 py-2.5 text-sm border-0 focus:outline-none focus:ring-1 focus:ring-[#075E54] shadow-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
            />

            {/* Send button */}
            <Button
              size="icon"
              className="size-10 rounded-full shrink-0 bg-[#075E54] hover:bg-[#064E46]"
              onClick={handleSend}
              disabled={!message.trim() || sendMutation.isPending}
            >
              <Send className="size-4" />
            </Button>
          </div>
          {sendMediaMutation.isPending && (
            <p className="text-xs text-center text-gray-500 mt-1">שולח קובץ...</p>
          )}
        </div>
      </div>
    )
  }

  // ===== CHAT LIST VIEW =====
  return (
    <div className="space-y-3">
      {/* Header - WhatsApp style */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#075E54]">WhatsApp</h1>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            onClick={() => setShowNewChat(!showNewChat)}
          >
            <Plus className="size-4 me-1" />
            שיחה חדשה
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="size-8"
            onClick={() => refetchChats()}
          >
            <RefreshCw className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* New Chat */}
      {showNewChat && (
        <Card className="border-[#075E54]">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Input
                placeholder="050-1234567"
                value={newChatPhone}
                onChange={(e) => setNewChatPhone(e.target.value)}
                className="text-sm"
                dir="ltr"
              />
              <Button
                size="sm"
                className="bg-[#075E54] hover:bg-[#064E46]"
                onClick={() => {
                  if (newChatPhone) {
                    const jid = normalizePhoneToJid(newChatPhone)
                    setSelectedChat(jid)
                    setSelectedChatName(newChatPhone)
                    setShowNewChat(false)
                  }
                }}
              >
                התחל
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="חיפוש לפי שם או מספר..."
          value={chatSearch}
          onChange={(e) => setChatSearch(e.target.value)}
          className="ps-9"
        />
      </div>

      {/* Chat List */}
      {chatsLoading ? (
        <div className="space-y-1">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px] rounded-lg" />
          ))}
        </div>
      ) : !filteredChats?.length ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <MessageCircle className="mx-auto mb-4 size-12 opacity-50" />
            <p>אין שיחות</p>
          </CardContent>
        </Card>
      ) : (
        <div className="divide-y rounded-lg border overflow-hidden">
          {filteredChats.map((chat: Chat) => {
            const phone = phoneFromJid(chat.id)
            return (
              <button
                key={chat.id}
                onClick={() => handleSelectChat(chat)}
                className="w-full text-start px-3 py-3 transition-colors hover:bg-muted/50 active:bg-muted flex items-center gap-3"
              >
                <div className="flex size-12 items-center justify-center rounded-full bg-[#DFE5E7] text-[#8696A0] shrink-0">
                  <User className="size-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-sm truncate">{chat.name || formatPhone(phone)}</p>
                    {chat.timestamp ? (
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {formatTimestamp(chat.timestamp)}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-xs text-muted-foreground truncate">
                      {chat.name ? (
                        <span dir="ltr" className="text-[11px]">{formatPhone(phone)} · </span>
                      ) : null}
                      {chat.lastMessage || ''}
                    </p>
                    {chat.unreadCount ? (
                      <Badge className="size-5 rounded-full p-0 flex items-center justify-center text-[10px] shrink-0 bg-[#25D366]">
                        {chat.unreadCount}
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function normalizePhoneToJid(phone: string): string {
  let cleaned = phone.replace(/[\s\-()]/g, '')
  if (cleaned.startsWith('0')) {
    cleaned = '972' + cleaned.slice(1)
  }
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.slice(1)
  }
  return `${cleaned}@s.whatsapp.net`
}
