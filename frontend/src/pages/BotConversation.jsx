import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getBotConversationMessages } from '../services/api';
import PageHeader from '../components/PageHeader';
import BotConversacionModal from '../components/BotConversacionModal';
import { FaRobot, FaArrowLeft, FaUser, FaEye } from 'react-icons/fa';

const BotConversation = () => {
  const { empresa, sessionId } = useParams();
  const navigate = useNavigate();
  const [conversation, setConversation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const messagesEndRef = useRef(null);

  const empresaNames = {
    'fc': 'Fortecar',
    'gv': 'Granville',
    'pw': 'Pampawagen'
  };

  const empresaName = empresaNames[empresa?.toLowerCase()] || empresa?.toUpperCase();

  useEffect(() => {
    loadConversation();
  }, [empresa, sessionId]);

  useEffect(() => {
    // Scroll al final cuando se cargan los mensajes
    if (conversation?.messages && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [conversation]);

  const loadConversation = async () => {
    try {
      setLoading(true);
      const response = await getBotConversationMessages(empresa.toUpperCase(), sessionId);
      
      if (response.data.success) {
        setConversation(response.data.data);
      }
    } catch (error) {
      console.error('Error cargando conversación:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Comparar solo la fecha (sin hora)
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const yesterdayOnly = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());

    let dateLabel = '';
    if (dateOnly.getTime() === todayOnly.getTime()) {
      dateLabel = 'Hoy';
    } else if (dateOnly.getTime() === yesterdayOnly.getTime()) {
      dateLabel = 'Ayer';
    } else {
      dateLabel = date.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    }

    const time = date.toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit'
    });

    return `${dateLabel} ${time}`;
  };

  const shouldShowDateSeparator = (currentMsg, previousMsg) => {
    if (!previousMsg) return true;
    
    const currentDate = new Date(currentMsg.createdDate);
    const previousDate = new Date(previousMsg.createdDate);
    
    // Mostrar separador si cambió el día
    return currentDate.toDateString() !== previousDate.toDateString();
  };

  const formatDateSeparator = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const yesterdayOnly = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());

    if (dateOnly.getTime() === todayOnly.getTime()) {
      return 'Hoy';
    } else if (dateOnly.getTime() === yesterdayOnly.getTime()) {
      return 'Ayer';
    } else {
      return date.toLocaleDateString('es-AR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-400">Cargando conversación...</p>
        </div>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="p-8">
        <div className="text-center py-12">
          <FaRobot className="text-6xl text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400 text-lg">No se encontró la conversación</p>
          <button
            onClick={() => navigate(`/bot-analyzer/${empresa}`)}
            className="mt-4 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
          >
            Volver al listado
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-0px)] bg-background">
      {/* Header */}
      <div className="bg-background-card border-b border-gray-700 p-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(`/bot-analyzer/${empresa}`)}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <FaArrowLeft className="text-gray-300" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-white">{empresaName}</h1>
            <p className="text-sm text-gray-400 font-mono">{sessionId}</p>
          </div>
          {/* Botón de acciones - solo si es elegible */}
          {conversation?.herramientasUtilizadas && !conversation.herramientasUtilizadas.tieneAgendarTurno && (
            <button
              onClick={() => setShowModal(true)}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              title="Acciones"
            >
              <FaEye className="text-gray-300 text-lg" />
            </button>
          )}
        </div>
      </div>

      {/* Área de mensajes tipo WhatsApp */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-900">
        <div className="max-w-4xl mx-auto space-y-4">
          {conversation.messages.map((msg, index) => {
            const previousMsg = index > 0 ? conversation.messages[index - 1] : null;
            const showDateSeparator = shouldShowDateSeparator(msg, previousMsg);
            const isUser = msg.role === 'userMessage';

            return (
              <div key={msg._id || index}>
                {showDateSeparator && (
                  <div className="flex justify-center my-6">
                    <span className="px-3 py-1 bg-gray-800 text-gray-400 text-xs rounded-full">
                      {formatDateSeparator(msg.createdDate)}
                    </span>
                  </div>
                )}

                <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-2`}>
                  <div className={`flex gap-2 max-w-[70%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                    {/* Avatar */}
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                      isUser ? 'bg-primary' : 'bg-gray-700'
                    }`}>
                      {isUser ? (
                        <FaUser className="text-white text-xs" />
                      ) : (
                        <FaRobot className="text-white text-xs" />
                      )}
                    </div>

                    {/* Burbuja de mensaje */}
                    <div className={`rounded-lg px-4 py-2 ${
                      isUser
                        ? 'bg-primary text-white rounded-tr-none'
                        : 'bg-gray-800 text-gray-100 rounded-tl-none'
                    }`}>
                      <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                      <p className={`text-xs mt-1 ${
                        isUser ? 'text-primary-200' : 'text-gray-400'
                      }`}>
                        {formatDate(msg.createdDate)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Footer con información */}
      <div className="bg-background-card border-t border-gray-700 p-4">
        <div className="max-w-4xl mx-auto flex justify-between items-center text-sm text-gray-400">
          <div>
            <span className="font-semibold">Total mensajes:</span> {conversation.totalMessages}
          </div>
          <div>
            <span className="font-semibold">Flow:</span> {conversation.flowName}
          </div>
        </div>
      </div>

      {/* Modal de acciones */}
      {showModal && conversation?.herramientasUtilizadas && (
        <BotConversacionModal
          empresa={empresa.toUpperCase()}
          sessionId={sessionId}
          herramientasUtilizadas={conversation.herramientasUtilizadas}
          onClose={() => setShowModal(false)}
          onUpdate={() => {
            // Recargar la conversación si es necesario
            loadConversation();
          }}
        />
      )}
    </div>
  );
};

export default BotConversation;

