﻿create or replace function private.session_privileges() 
  returns text stable as $$
  /* Copyright (c) 1999-2011 by OpenMFG LLC, d/b/a xTuple. 
     See www.xm.ple.com/CPAL for the full text of the software license. */

  // ..........................................................
  // PROCESS
  //
  var rec = executeSql( 'select privilege, granted from privgranted' );
	/* Testing to format json string (rec, null, 2) */
  return rec.length ? JSON.stringify (rec) : '{}';

$$ LANGUAGE plv8;
/*
select private.session_privileges();
*/