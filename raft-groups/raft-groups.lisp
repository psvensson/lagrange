(defpackage #:raft-groups
  (:use #:cl)
  (:export :raft-group :raft-group-member))

(in-package :raft-groups)

(defclass raft-group ()
  ((members
    :initarg :members
    :accessor :members)
   (status
    :initform nil
    :accessor status)))
    
(defun make-raft-group (members)
  (make-instance 'raft-group :members members)
  ;; TODO: start any existing member raft groups using low-level rqlite
  
  
  )
    
(defgeneric addMember (raft-group-manager system-node)
  (:documentation "adding a new member to a raft group, identified by node")
)    
    
(defmethod addMember (raft-group-manager system-node)
  ;; Send remote addRaftGroupMember message to node
  ;; If successful, the message returns the port of the new raft group member service
  ;; I then update the raft group configuration in the local cache, which will update all other nodes eventually
  
)    
    
(defclass raft-group-member ()
  ((address
    :initarg :address
    :accessor :addresss)
   (leader
    :initform nil
    :accessor leader)
   (reachable
    :initform nil
    :accessor reachable)))    