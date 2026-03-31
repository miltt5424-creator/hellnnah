//+------------------------------------------------------------------+
//| ElJoven_MT5_AutoExecutor.mq5                                     |
//| El Joven Scalp PRO — Auto Execution Bridge v1.0                  |
//| Polls backend every N seconds and executes BUY/SELL/CLOSE orders |
//+------------------------------------------------------------------+
#property strict
#property version   "1.00"
#property description "El Joven Scalp PRO — MT5 Auto Executor"
#include <Trade/Trade.mqh>

input string ApiBaseUrl             = "http://localhost:3001";
input string BridgeToken            = "eljoven-secret";
input bool   UseChartSymbolAsBroker = true;
input string BrokerSymbolOverride   = "";
input int    PollIntervalSec        = 3;
input int    HeartbeatEverySec      = 8;
input int    HttpTimeoutMs          = 5000;
input int    DeviationPoints        = 50;
input int    MagicNumber            = 202500;
input bool   AutoTradeEnabled       = true;

string NextCommandPath = "/api/mt5/executor/next";
string AckPath         = "/api/mt5/executor/ack";
string HeartbeatPath   = "/api/mt5/bots/heartbeat";

CTrade   trade;
datetime g_lastHeartbeat = 0;
string   g_lastCommandId = "";
string   g_lastAction    = "INIT";

string JsonEscape(string s) {
   StringReplace(s,"\\","\\\\"); StringReplace(s,"\"","\\\"");
   StringReplace(s,"\r"," ");   StringReplace(s,"\n"," ");
   return s;
}

string BuildHeaders() {
   return "Content-Type: application/json\r\nx-mt5-token: "+BridgeToken+"\r\n";
}

bool PostJson(string path, string payload, int &httpCode, string &body) {
   string url = ApiBaseUrl+path, headers = BuildHeaders();
   char postData[], result[]; string rh="";
   StringToCharArray(payload, postData, 0, WHOLE_ARRAY, CP_UTF8);
   if(ArraySize(postData)>0 && postData[ArraySize(postData)-1]==0)
      ArrayResize(postData, ArraySize(postData)-1);
   ResetLastError();
   httpCode = WebRequest("POST", url, headers, HttpTimeoutMs, postData, result, rh);
   if(httpCode==-1) {
      Print("[ElJoven] WebRequest error ",GetLastError()," | Add to MT5 WebRequest whitelist: ",url);
      body=""; return false;
   }
   body = CharArrayToString(result); return true;
}

string JsonStr(string json, string key) {
   string needle = "\""+key+"\"";
   int pos=StringFind(json,needle); if(pos<0) return "";
   int colon=StringFind(json,":",pos+StringLen(needle)); if(colon<0) return "";
   int start=StringFind(json,"\"",colon+1); if(start<0) return "";
   int end=StringFind(json,"\"",start+1);
   while(end>0 && StringGetCharacter(json,end-1)==92) end=StringFind(json,"\"",end+1);
   if(end<0) return "";
   return StringSubstr(json,start+1,end-start-1);
}

double JsonNum(string json, string key, double fb=0.0) {
   string needle="\""+key+"\"";
   int pos=StringFind(json,needle); if(pos<0) return fb;
   int colon=StringFind(json,":",pos+StringLen(needle)); if(colon<0) return fb;
   int len=StringLen(json), s=colon+1;
   while(s<len){int c=StringGetCharacter(json,s);if(c==' '||c=='\t'||c=='\n'||c=='\r'||c=='"'){s++;}else break;}
   int e=s;
   while(e<len){int c=StringGetCharacter(json,e);if((c>='0'&&c<='9')||c=='.'||c=='-'||c=='+'){e++;}else break;}
   if(e<=s) return fb;
   return StringToDouble(StringSubstr(json,s,e-s));
}

bool JsonBool(string json, string key, bool fb=false) {
   string needle="\""+key+"\"";
   int pos=StringFind(json,needle); if(pos<0) return fb;
   int colon=StringFind(json,":",pos+StringLen(needle)); if(colon<0) return fb;
   string tail=StringToLower(StringSubstr(json,colon+1));
   int tp=StringFind(tail,"true"), fp=StringFind(tail,"false");
   if(tp>=0&&tp<=5) return true; if(fp>=0&&fp<=5) return false;
   return fb;
}

string ResolveBrokerSymbol() {
   if(UseChartSymbolAsBroker) return _Symbol;
   string s=StringTrimLeft(StringTrimRight(BrokerSymbolOverride));
   return (s=="") ? _Symbol : s;
}

void AdjustStops(string symbol, string side, double &sl, double &tp) {
   int digits=(int)SymbolInfoInteger(symbol,SYMBOL_DIGITS);
   double point=SymbolInfoDouble(symbol,SYMBOL_POINT); if(point<=0) point=0.00001;
   double stopsLevel = MathMax((int)SymbolInfoInteger(symbol,SYMBOL_TRADE_STOPS_LEVEL),(int)SymbolInfoInteger(symbol,SYMBOL_TRADE_FREEZE_LEVEL));
   if(stopsLevel < 100) stopsLevel = 100;
   double minDist = (stopsLevel + 10) * point;
   MqlTick tick; if(!SymbolInfoTick(symbol,tick)) return;
   double ref=(StringToUpper(side)=="BUY") ? tick.ask : tick.bid; if(ref<=0) return;
   if(StringToUpper(side)=="BUY"){
      if(sl>0&&sl>=ref-minDist) sl=ref-minDist;
      if(tp>0&&tp<=ref+minDist) tp=ref+minDist;
   } else {
      if(sl>0&&sl<=ref+minDist) sl=ref+minDist;
      if(tp>0&&tp>=ref-minDist) tp=ref-minDist;
   }
   if(sl>0) sl=NormalizeDouble(sl,digits);
   if(tp>0) tp=NormalizeDouble(tp,digits);
}

bool SendAck(string commandId, string status, double fillPrice, double volume, string note) {
   string p="{";
   p+="\"commandId\":\""+JsonEscape(commandId)+"\",";
   p+="\"status\":\""+JsonEscape(status)+"\",";
   p+="\"fillPrice\":"+DoubleToString(fillPrice,_Digits)+",";
   p+="\"volume\":"+DoubleToString(volume,3)+",";
   p+="\"note\":\""+JsonEscape(note)+"\",";
   p+="\"token\":\""+JsonEscape(BridgeToken)+"\"";
   p+="}";
   int h=0; string b="";
   if(!PostJson(AckPath,p,h,b)) return false;
   if(h<200||h>=300){Print("[ElJoven] ACK HTTP ",h,"|",b);return false;}
   return true;
}

void SendHeartbeat() {
   datetime now=TimeCurrent();
   if((now-g_lastHeartbeat)<HeartbeatEverySec) return;
   string sym=ResolveBrokerSymbol();
   string p="{";
   p+="\"token\":\""+JsonEscape(BridgeToken)+"\",";
   p+="\"terminal\":\"mt5-eljoven\",";
   p+="\"accountId\":\""+(string)(long)AccountInfoInteger(ACCOUNT_LOGIN)+"\",";
   p+="\"symbol\":\""+JsonEscape(sym)+"\",";
   p+="\"brokerSymbol\":\""+JsonEscape(sym)+"\",";
   p+="\"equity\":"+DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY),2)+",";
   p+="\"balance\":"+DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE),2)+",";
   p+="\"openPositions\":"+(string)PositionsTotal()+",";
   p+="\"lastAction\":\""+JsonEscape(g_lastAction)+"\"";
   p+="}";
   int h=0; string b="";
   if(PostJson(HeartbeatPath,p,h,b)&&h>=200&&h<300) g_lastHeartbeat=now;
}

void PollAndExecute() {
   if(!AutoTradeEnabled) return;
   string sym=ResolveBrokerSymbol();
   string p="{";
   p+="\"token\":\""+JsonEscape(BridgeToken)+"\",";
   p+="\"accountId\":\""+(string)(long)AccountInfoInteger(ACCOUNT_LOGIN)+"\",";
   p+="\"brokerSymbol\":\""+JsonEscape(sym)+"\"";
   p+="}";
   int h=0; string body="";
   if(!PostJson(NextCommandPath,p,h,body)) return;
   if(h<200||h>=300){Print("[ElJoven] NEXT HTTP ",h,"|",body);return;}
   if(!JsonBool(body,"hasCommand",false)) return;
   string commandId=JsonStr(body,"commandId");
   if(commandId==""||commandId==g_lastCommandId) return;
   string side=StringToUpper(JsonStr(body,"side"));
   string execSym=JsonStr(body,"brokerSymbol"); if(execSym=="") execSym=sym;
   double volume=JsonNum(body,"volume",0.0);
   double sl=JsonNum(body,"stopLoss",0.0);
   double tp=JsonNum(body,"takeProfit",0.0);

   // CLOSE
   if(side=="CLOSE") {
      int closed=0;
      for(int i=PositionsTotal()-1;i>=0;i--) {
         string ps=PositionGetSymbol(i);
         if(ps==execSym||execSym=="ALL"||execSym=="XAUUSD"){if(trade.PositionClose(PositionGetTicket(i)))closed++;}
      }
      SendAck(commandId,"FILLED",0.0,0.0,"Closed "+(string)closed+" positions");
      g_lastCommandId=commandId; g_lastAction="CLOSE "+execSym; return;
   }

   if(volume<=0||(side!="BUY"&&side!="SELL")){
      SendAck(commandId,"REJECTED",0.0,volume,"Invalid: side="+side+" vol="+DoubleToString(volume,3));
      g_lastCommandId=commandId; return;
   }
   if(!SymbolSelect(execSym,true)){
      SendAck(commandId,"REJECTED",0.0,volume,"SymbolSelect failed: "+execSym);
      g_lastCommandId=commandId; return;
   }

   trade.SetExpertMagicNumber(MagicNumber);
   trade.SetDeviationInPoints(DeviationPoints);
   string comment="ElJoven_"+StringSubstr(commandId,StringLen(commandId)-8);
   double adjSl=sl, adjTp=tp;
   AdjustStops(execSym,side,adjSl,adjTp);

   bool ok=(side=="BUY")
      ? trade.Buy(volume,execSym,0.0,adjSl,adjTp,comment)
      : trade.Sell(volume,execSym,0.0,adjSl,adjTp,comment);
   int   ret=(int)trade.ResultRetcode();
   string retDesc=trade.ResultRetcodeDescription();
   double fillPrice=trade.ResultPrice();

   if(!ok&&ret==TRADE_RETCODE_INVALID_STOPS) {
      ok=(side=="BUY")
         ? trade.Buy(volume,execSym,0.0,0.0,0.0,comment+"_fb")
         : trade.Sell(volume,execSym,0.0,0.0,0.0,comment+"_fb");
      ret=(int)trade.ResultRetcode(); fillPrice=trade.ResultPrice();
      retDesc+="|fallback_nostops";
      if(ok&&(ret==TRADE_RETCODE_DONE||ret==TRADE_RETCODE_DONE_PARTIAL)&&(sl>0||tp>0)){
         AdjustStops(execSym,side,sl,tp); trade.PositionModify(execSym,sl,tp);
      }
   }

   if(fillPrice<=0.0){MqlTick tick;if(SymbolInfoTick(execSym,tick))fillPrice=(side=="BUY")?tick.ask:tick.bid;}
   string status=(ok&&(ret==TRADE_RETCODE_DONE||ret==TRADE_RETCODE_DONE_PARTIAL))?"FILLED":"REJECTED";
   if(SendAck(commandId,status,fillPrice,volume,status+"|"+retDesc)){
      g_lastCommandId=commandId;
      g_lastAction=side+" "+execSym+" "+status+" @"+DoubleToString(fillPrice,_Digits);
      Print("[ElJoven] ",g_lastAction);
   }
}

int OnInit() {
   EventSetTimer(MathMax(1,PollIntervalSec));
   trade.SetExpertMagicNumber(MagicNumber);
   trade.SetDeviationInPoints(DeviationPoints);
   Print("[ElJoven] AutoExecutor STARTED | ",_Symbol," | poll=",PollIntervalSec,"s | backend=",ApiBaseUrl);
   Print("[ElJoven] IMPORTANT: Tools > Options > Expert Advisors > Allow WebRequest: ",ApiBaseUrl);
   return(INIT_SUCCEEDED);
}
void OnDeinit(const int reason) { EventKillTimer(); Print("[ElJoven] AutoExecutor STOPPED"); }
void OnTimer() {
   SendHeartbeat(); PollAndExecute();
   Comment("=== El Joven Scalp PRO ===\nSymbol: ",_Symbol,"\nLast Action: ",g_lastAction,"\nLast CMD: ",
      (g_lastCommandId==""?"none":StringSubstr(g_lastCommandId,StringLen(g_lastCommandId)-8)),
      "\nAutoTrade: ",AutoTradeEnabled?"ON":"OFF","\nBackend: ",ApiBaseUrl);
}
