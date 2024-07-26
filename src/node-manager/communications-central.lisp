;; Communications-central

;;This class is the entry-point for the whole system. It has a websockets-server set up to receive commands in the form of JSON data which it parses into 
;;LISP CLOS objects.

;;There will be one command class per command data ‘command-type’ property, which is used to create the correct command object when parsing, in proper 
;;polymorphic OO manner. Example command-types are ‘join-system’, ‘leave-system’, ‘send-query’, ‘create-replica’, ‘delete-replica’ and ‘reply’.

;;This class also has a function which takes a command object, an address and a callback lambda, and sends the command (translated into JSON) 
;;to the address. When a ‘reply’ command is received for the send command, the callback will be invoked with the result.
(in-package :node-manager)

(require 'json)
(require 'cl-json)
(require 'clack)
(require 'websocket-driver) 
(require 'cl-lib)

;; Define the commands from a base class. The commands only contain command-type and payload
(defclass command ()
  ((command-type :initarg :command-type :accessor command-type)
   (payload :initarg :payload :accessor payload)))


;; Define the command command-types
(defclass join-system (command)
  ((name :initarg :name :accessor name)))
(defmethod dispatch ((join-system command))
  
    )

(defclass leave-system (command)
  ((name :initarg :name :accessor name)))
(defmethod dispatch ((leave-system command))
  
    )

(defclass send-query (command)
  ((query :initarg :query :accessor query)))
(defmethod dispatch ((send-query command))
  
    )

(defclass create-replica (command)
  ((name :initarg :name :accessor name)))
(defmethod dispatch ((create-replica command))
  
    )

(defclass delete-replica (command)
  ((name :initarg :name :accessor name)))
(defmethod dispatch ((delete-replica command))
  
    )

(defclass reply (command)
  ((result :initarg :result :accessor result)))
(defmethod dispatch ((reply command))
  
    )

;; Define the command parser to leverage polymorpgic OO technicques to create the correct command-type of command object from JSON data using a single make-instance call
(defun parse-command (json-data)
  (let ((command-type (cdr (assoc 'command-type json-data)))
        (payload (cdr (assoc 'payload json-data))))
    (make-instance (intern (concatenate 'string (symbol-name command-type) "-command")) :command-type command-type :payload payload)))

;; Define the command sender
(defun send-command (command address callback)
(require 'cl-json)
(let ((json-data (json:encode-json-to-string (list (cons 'command-type (command-type command)) (cons 'payload (payload command))))))
    (websocket-send-text address json-data)
    (setf (websocket-callbacks address) (cons (lambda (websocket frame) (funcall callback (parse-command (json-read-from-string (websocket-frame-text frame))))) (websocket-callbacks address)))))

;; Define the command receiver
(defun receive-command (websocket callback)
  (setf (websocket-callbacks websocket) (cons (lambda (websocket frame) (funcall callback (parse-command (json-read-from-string (websocket-frame-text frame))))) (websocket-callbacks websocket))))

;; Define on-client-message which should use parse-command to create a command from the payload of the message and then dispatch on the command-type to invoke the correct handler
(defun on-client-message (websocket message)
  (let ((command (parse-command (json:decode-json-from-string message))))
    (format t "Received command: ~S~%" command)
        (dispatch command)))
    

(defun chat-server (env)
    (let ((ws (websocket-driver:make-server env)))

    (websocket-driver:on :open ws
                         (lambda () (handle-new-connection ws)))

    (websocket-driver:on :message ws
                         (lambda (msg)
                            (format t "Received: ~S~%" msg)
                            (on-client-message ws msg)))

    (websocket-driver:on :close ws
                         (lambda (&key code reason)
                           (declare (ignore code reason))
                           (handle-close-connection ws)))
    (lambda (responder)
      (declare (ignore responder))
      (websocket-driver:start-connection ws))))


 







