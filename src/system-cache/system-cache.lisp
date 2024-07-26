(defclass system-cache ()
  ((cache :initarg :cache
          :initform (make-hash-table :test 'equal)
          :accessor cache)))

